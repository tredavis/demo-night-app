# Feature Proposal: Concurrent Multi-Event Support

## Executive Summary

**Feature**: Multi-Chapter Concurrent Event Infrastructure  
**Problem**: Only one event can be "live" at a time. If SF and NYC want to host simultaneous demo nights, the system breaks.  
**Solution**: Refactor Redis architecture to support unlimited concurrent events with event-specific state isolation.  
**Value**: Enables true multi-chapter scale, eliminates scheduling conflicts, and prepares for global expansion.

---

## The Problem

### Current State

The Demo Night App has a **critical architectural bottleneck**:

- **Single global "currentEvent"**: Redis stores ONE event as "the current event"
- **Scheduling conflicts**: If SF schedules for 6pm PST and NYC for 9pm EST (same time), only one can run
- **Admin collision**: If two admins try to present simultaneously, they overwrite each other's state
- **Scale ceiling**: Cannot support more than ~3-5 chapters if they're all in different time zones

### Evidence from Codebase

**Redis State Management** (`src/lib/types/currentEvent.ts`):
```typescript
// Current implementation - SINGLE event
export async function getCurrentEvent(): Promise<CurrentEvent | null> {
  return await kv.get("currentEvent");  // ❌ Global singleton
}

export async function updateCurrentEvent(event: {...} | null) {
  return kv.set("currentEvent", event);  // ❌ Overwrites any existing event
}
```

**Impact on Attendee Experience** (`src/app/(attendee)/page.tsx`):
```typescript
export default async function AttendeePage() {
  const currentEvent = await api.event.getCurrent();
  // ❌ Shows whichever event is in Redis, not the one attendee joined
  if (!currentEvent) return <HallOfFamePage />;
  return <Workspaces currentEvent={currentEvent} />;
}
```

**Impact on Admin Control** (`src/app/admin/present/...`):
```typescript
// Admin sets "the" current event (evicts any other live event)
await kv.updateCurrentEvent({ id: eventId, name: eventName });
```

### Who This Affects

**Primary**: Multi-chapter organizations planning simultaneous events
- Can't scale beyond 1 event at a time
- Must coordinate schedules across time zones
- Risk of admin confusion if events overlap accidentally

**Secondary**: Attendees who joined a specific chapter's event
- Might see the "wrong" event if another chapter goes live
- Confusing experience if event switches mid-session

**Tertiary**: Platform growth potential
- Cannot support 10+ chapters (inevitable scheduling conflicts)
- Cannot offer "follow-the-sun" demo nights (Asia → Europe → Americas)

### Real Impact

Imagine this scenario:

> **6:00pm PST**: SF admin starts their demo night (100 attendees)  
> **6:05pm PST (9:05pm EST)**: NYC admin starts their demo night  
> **Result**: SF event disappears from Redis. SF attendees now see NYC's event. Chaos.

Current workaround: Manually coordinate schedules to ensure zero overlap. This breaks down at scale.

---

## Proposed Solution

### Concurrent Event Architecture

**Core Change**: Replace global `currentEvent` singleton with event-scoped Redis keys.

**Before**:
```
Redis Key: "currentEvent"
Value: { id: "evt_sf", phase: "Demos", ... }
```

**After**:
```
Redis Keys:
  "currentEvent:evt_sf"     → { id: "evt_sf", phase: "Demos", ... }
  "currentEvent:evt_nyc"    → { id: "evt_nyc", phase: "Voting", ... }
  "currentEvent:evt_london" → { id: "evt_london", phase: "Pre", ... }
  "activeEvents"            → Set["evt_sf", "evt_nyc", "evt_london"]
```

### Why This Pattern Is Superior

**1. Atomic Operations**
- Each event updates independently (no race conditions)
- SF admin and NYC admin can change phases simultaneously without conflict

**2. Direct Lookups**
- `O(1)` access: `GET currentEvent:{eventId}`
- No scanning arrays to find the right event

**3. Individual TTLs**
- Auto-expire stale events: `EXPIRE currentEvent:evt_123 7200`
- Prevents "zombie" events lingering in Redis

**4. Pattern Matching**
- Get all active events: `SCAN 0 MATCH currentEvent:*`
- Query by chapter: future pattern `currentEvent:chapter_{id}:{eventId}`

**5. Memory Efficiency**
- Small strings stored efficiently in Redis
- No JSON serialization overhead for arrays

### How It Works

**Scenario: SF and NYC run simultaneous events**

1. **SF Admin** (6pm PST):
   - Opens `/admin/present?eventId=evt_sf`
   - Sets `currentEvent:evt_sf` with phase "Pre"
   - SF attendees at `/sf-demo` see SF event

2. **NYC Admin** (9pm EST / 6pm PST):
   - Opens `/admin/present?eventId=evt_nyc`
   - Sets `currentEvent:evt_nyc` with phase "Pre"
   - NYC attendees at `/nyc-demo` see NYC event

3. **Both events progress independently**:
   - SF moves to "Demos" phase → updates `currentEvent:evt_sf`
   - NYC moves to "Voting" phase → updates `currentEvent:evt_nyc`
   - Zero interference

4. **After events end**:
   - Both keys auto-expire after 2 hours
   - Or admins manually end → delete keys

### What Changes in the UI

**For Attendees**: Almost nothing!
- URL `/{eventUrl}` already identifies which event they're attending
- System just needs to look up that specific event's state in Redis
- Experience remains identical

**For Admins**: Zero visible changes!
- Admin URLs already have `eventId` in path or params
- Backend passes eventId to Redis operations
- UI and controls stay the same

**For Organizers**: New capability unlocked!
- Can schedule overlapping events without coordination
- No more "time slot conflicts" discussions
- Natural scaling to 10, 20, 50 chapters

---

## User Stories

| Role | Goal | Benefit |
|------|------|---------|
| **Chapter Admin (SF)** | I want to run my demo night at 6pm PST without checking if other chapters are live | So I can focus on my event, not coordinate schedules globally |
| **Chapter Admin (NYC)** | I want to start my event at 9pm EST even though SF is still presenting | So NYC attendees don't have to wait 3 hours for SF to finish |
| **Attendee (SF)** | I want to see SF's event when I visit the SF event URL | So I'm not confused by seeing NYC's event by accident |
| **Attendee (NYC)** | I want to vote on NYC demos even while SF is in their voting phase | So my experience isn't interrupted by unrelated events |
| **Org Admin** | I want to see which chapters are currently live across all time zones | So I can monitor all events from one dashboard |
| **Platform** | We want to support 50+ chapters globally without architectural changes | So the platform scales naturally as the community grows |

---

## Technical Implementation

### 1. Database

**✅ No schema changes required!** This is purely a Redis refactor.

All event data remains in PostgreSQL:
- `Event` table: permanent event records
- `Chapter` table: chapter associations
- `Demo`, `Feedback`, `Vote` tables: event content

Redis only stores temporary "live event" state.

### 2. Redis Functions Refactor

**File**: `src/lib/types/currentEvent.ts`

**Current** (9 lines, 3 functions):
```typescript
export async function getCurrentEvent(): Promise<CurrentEvent | null> {
  return await kv.get("currentEvent");
}

export async function updateCurrentEvent(event: {...} | null) {
  if (!event) {
    return kv.set("currentEvent", null);
  }
  // ... create event object ...
  return kv.set("currentEvent", currentEvent);
}

export async function updateCurrentEventState({phase, currentDemoId, currentAwardId}) {
  const currentEvent = await getCurrentEvent();
  if (!currentEvent) throw new Error("No current event");
  // ... update fields ...
  return kv.set("currentEvent", currentEvent);
}
```

**New** (multi-event support):
```typescript
// Get specific event's state
export async function getCurrentEvent(eventId: string): Promise<CurrentEvent | null> {
  return await kv.get(`currentEvent:${eventId}`);
}

// Set event as active
export async function updateCurrentEvent(
  event: { id: string; name: string; config?: any } | null
) {
  if (!event) {
    // Remove from active events
    await kv.srem("activeEvents", event.id);
    return kv.del(`currentEvent:${event.id}`);
  }

  const config = event.config as EventConfig | undefined;
  const isPitchNight = config?.isPitchNight ?? false;

  const currentEvent: CurrentEvent = {
    id: event.id,
    name: event.name,
    phase: EventPhase.Pre,
    currentDemoId: null,
    currentAwardId: null,
    isPitchNight,
  };

  // Add to active events set
  await kv.sadd("activeEvents", event.id);
  
  // Store event state with 2-hour auto-expiry
  await kv.set(`currentEvent:${event.id}`, currentEvent);
  await kv.expire(`currentEvent:${event.id}`, 7200); // 2 hours
  
  return currentEvent;
}

// Update specific event's state
export async function updateCurrentEventState(
  eventId: string,
  updates: {
    phase?: EventPhase;
    currentDemoId?: string | null;
    currentAwardId?: string | null;
  }
) {
  const currentEvent = await getCurrentEvent(eventId);
  if (!currentEvent) {
    throw new Error(`No current event found for eventId: ${eventId}`);
  }

  if (updates.phase !== undefined) currentEvent.phase = updates.phase;
  if (updates.currentDemoId !== undefined) currentEvent.currentDemoId = updates.currentDemoId;
  if (updates.currentAwardId !== undefined) currentEvent.currentAwardId = updates.currentAwardId;

  return kv.set(`currentEvent:${eventId}`, currentEvent);
}

// Get all active events (new helper)
export async function getActiveEvents(): Promise<string[]> {
  return await kv.smembers("activeEvents") ?? [];
}

// Get all active events with full state (new helper)
export async function getAllCurrentEvents(): Promise<CurrentEvent[]> {
  const eventIds = await getActiveEvents();
  const events = await Promise.all(
    eventIds.map(id => getCurrentEvent(id))
  );
  return events.filter((e): e is CurrentEvent => e !== null);
}
```

**Changes**:
- ✅ All functions now accept/use `eventId`
- ✅ Redis keys scoped: `currentEvent:{eventId}`
- ✅ Added `activeEvents` SET for quick lookups
- ✅ Added auto-expiry (2 hours)
- ✅ Added helper functions for multi-event queries

### 3. tRPC Router Updates

**File**: `src/server/api/routers/event.ts`

**Procedure 1: Get Current Event** (attendee-facing)
```typescript
getCurrent: publicProcedure
  .input(z.object({ eventId: z.string() }).optional())  // Add eventId input
  .output(/* same */)
  .query(async ({ input }) => {
    // If eventId provided, get that specific event
    if (input?.eventId) {
      return await kv.getCurrentEvent(input.eventId);
    }
    
    // LEGACY FALLBACK: If no eventId, check if only one event is active
    const activeEvents = await kv.getAllCurrentEvents();
    if (activeEvents.length === 1) {
      return activeEvents[0];  // Backwards compatible
    }
    
    // Multiple events active, cannot determine which one
    return null;
  }),
```

**Procedure 2: Set Current Event** (admin starts event)
```typescript
setCurrentEvent: protectedProcedure
  .input(z.object({ eventId: z.string() }))
  .mutation(async ({ input }) => {
    const event = await db.event.findUnique({
      where: { id: input.eventId },
      select: { id: true, name: true, config: true },
    });
    if (!event) throw new Error("Event not found");
    
    return kv.updateCurrentEvent(event);  // Sets currentEvent:{eventId}
  }),
```

**Procedure 3: Update Event State** (admin changes phase)
```typescript
updateCurrentState: protectedProcedure
  .input(
    z.object({
      eventId: z.string(),  // Add eventId
      phase: z.nativeEnum(kv.EventPhase).optional(),
      currentDemoId: z.string().optional().nullable(),
      currentAwardId: z.string().optional().nullable(),
    }),
  )
  .mutation(async ({ input }) => {
    const { eventId, ...updates } = input;
    return kv.updateCurrentEventState(eventId, updates);
  }),
```

**New Procedure: Get Active Events** (for dashboard)
```typescript
getActiveEvents: publicProcedure
  .query(async () => {
    return await kv.getAllCurrentEvents();
  }),
```

### 4. Attendee Page Routing

**File**: `src/app/(attendee)/page.tsx`

**Current** (shows global current event):
```typescript
export default async function AttendeePage() {
  const currentEvent = await api.event.getCurrent();
  if (!currentEvent) return <HallOfFamePage />;
  return <Workspaces currentEvent={currentEvent} />;
}
```

**Option A: Root shows selector if multiple events** (recommended)
```typescript
export default async function AttendeePage() {
  const activeEvents = await api.event.getActiveEvents();
  
  // No events live → Hall of Fame
  if (activeEvents.length === 0) {
    return <HallOfFamePage />;
  }
  
  // One event live → Show it (backwards compatible)
  if (activeEvents.length === 1) {
    return <Workspaces currentEvent={activeEvents[0]} />;
  }
  
  // Multiple events → Show selector
  return <EventSelector events={activeEvents} />;
}
```

**Event-Specific Route** (already exists, just update):
```typescript
// File: src/app/(attendee)/[eventUrl]/page.tsx (NEW)
export default async function EventPage({ params }: { params: { eventUrl: string } }) {
  // Look up event by URL
  const event = await db.event.findFirst({
    where: { url: params.eventUrl },
    select: { id: true },
  });
  
  if (!event) notFound();
  
  // Get that specific event's state
  const currentEvent = await kv.getCurrentEvent(event.id);
  if (!currentEvent) {
    return <div>Event not currently live. <Link to="/">See all events</Link></div>;
  }
  
  return <Workspaces currentEvent={currentEvent} />;
}
```

### 5. Admin Present Mode

**File**: `src/app/admin/present/page.tsx`

**Already has eventId in URL!** Just pass it through:

```typescript
// Present mode already scoped to eventId via query param
export default async function AdminPresentPage({
  searchParams
}: {
  searchParams: { eventId: string }
}) {
  const eventId = searchParams.eventId;
  const currentEvent = await kv.getCurrentEvent(eventId);  // Pass eventId
  
  return <PresentationView currentEvent={currentEvent} />;
}
```

**Update hooks**: Pass eventId from context to mutations
```typescript
// src/app/admin/present/hooks/useEventAdminSync.ts
export default function useEventAdminSync(eventId: string, initialCurrentEvent: CurrentEvent) {
  const { data: currentEvent } = api.event.getCurrent.useQuery(
    { eventId },  // Pass eventId
    { initialData: initialCurrentEvent, refetchInterval: 5000 }
  );
  
  // ... rest unchanged
}
```

### 6. Admin Dashboard

**File**: `src/app/admin/[eventId]/...` (already scoped to eventId!)

Just pass eventId to mutations:
```typescript
// src/app/admin/[eventId]/components/ControlCenter/ControlCenterTab.tsx
const updateCurrentStateMutation = api.event.updateCurrentState.useMutation();

const setPhase = (phase: EventPhase) => {
  updateCurrentStateMutation.mutateAsync({ 
    eventId: event.id,  // Add eventId from context
    phase 
  });
};
```

### 7. React Hooks Updates

**File**: `src/app/(attendee)/hooks/useEventSync.ts`
```typescript
export default function useEventSync(eventId: string, initialCurrentEvent: CurrentEvent) {
  const { data: currentEvent } = api.event.getCurrent.useQuery(
    { eventId },  // Pass eventId
    { initialData: initialCurrentEvent, refetchInterval: 5000 }
  );
  // ... rest unchanged
}
```

### Files That Need Changes (Complete List)

| File | Change | Effort |
|------|--------|--------|
| `src/lib/types/currentEvent.ts` | Refactor 3 functions, add 2 helpers | 30min |
| `src/server/api/routers/event.ts` | Update 3 procedures, add 1 new | 30min |
| `src/app/(attendee)/page.tsx` | Add multi-event logic | 20min |
| `src/app/(attendee)/hooks/useEventSync.ts` | Add eventId parameter | 10min |
| `src/app/admin/present/page.tsx` | Pass eventId to hooks | 10min |
| `src/app/admin/present/hooks/useEventAdminSync.ts` | Add eventId parameter | 10min |
| `src/app/admin/[eventId]/components/ControlCenter/ControlCenterTab.tsx` | Pass eventId to mutations | 10min |
| `src/app/admin/[eventId]/components/ControlCenter/DemosAndFeedbackTab.tsx` | Pass eventId to mutations | 10min |
| `src/app/admin/[eventId]/components/ControlCenter/AwardsAndVotingTab.tsx` | Pass eventId to mutations | 10min |
| `src/app/admin/[eventId]/components/ResultsDashboard/index.tsx` | Pass eventId to mutations | 10min |

**Total**: 10 files, ~2.5 hours

---

## Implementation Plan

### Phase 1: Redis Refactor (1 hour)

**Goal**: Update Redis functions to use event-scoped keys

1. **Refactor `currentEvent.ts`** (30min)
   - Add `eventId` parameter to all functions
   - Change `"currentEvent"` → `` `currentEvent:${eventId}` ``
   - Add `activeEvents` SET operations
   - Add auto-expiry logic
   - Add helper functions

2. **Update tRPC router** (30min)
   - Add `eventId` to procedure inputs
   - Update procedure implementations
   - Add `getActiveEvents` procedure
   - Test with existing seed data

### Phase 2: Admin Integration (1 hour)

**Goal**: Ensure admins can control events without conflict

1. **Update present mode** (20min)
   - Pass `eventId` from query params to hooks
   - Update `useEventAdminSync` hook

2. **Update admin dashboard** (30min)
   - Pass `eventId` to mutations in Control Center
   - Update Demos/Feedback tab
   - Update Awards/Voting tab
   - Update Results dashboard

3. **Testing** (10min)
   - Open two browser windows as different chapter admins
   - Start two events simultaneously
   - Verify independent phase control

### Phase 3: Attendee Experience (45min)

**Goal**: Route attendees to their specific event

1. **Update root page** (20min)
   - Check active events count
   - Show selector if multiple
   - Backwards compatible for single event

2. **Create event selector component** (15min)
   - Simple list of active events
   - Link to each event URL

3. **Update hooks** (10min)
   - Pass `eventId` to `useEventSync`
   - Ensure polling works per-event

### Phase 4: Testing & Polish (30min)

**Goal**: Verify everything works concurrently

1. **Multi-event test** (15min)
   - Seed two events (SF, NYC)
   - Start both as current events
   - Navigate as attendee to each
   - Control as admin for each
   - Verify independence

2. **Edge cases** (10min)
   - Event ends → key expires
   - Admin closes event → key deleted
   - No active events → Hall of Fame
   - Only one event → backwards compatible

3. **Documentation** (5min)
   - Update README with concurrent event notes
   - Document Redis key patterns

**Total Time**: ~3 hours

---

## Success Metrics

### Technical Validation (Day 1)

- ✅ Can start 2+ events simultaneously without errors
- ✅ Each event's state updates independently
- ✅ Attendees see correct event based on URL
- ✅ Admins can control events without interference
- ✅ Redis keys auto-expire after events end

### Operational Success (First Month)

- ✅ Zero scheduling conflicts between chapters
- ✅ No "wrong event showing" bug reports
- ✅ 2+ concurrent events successfully run in production
- ✅ Average event overlap increases (proof chapters can schedule freely)

### Scale Indicators (3 Months)

- ✅ 5+ chapters hosting events in same week without coordination
- ✅ "Follow-the-sun" event pattern emerges (Asia → Europe → Americas)
- ✅ Peak concurrent events: 3+ simultaneously
- ✅ Redis memory usage remains stable (old keys expire properly)

### Community Impact (6 Months)

- ✅ Chapter count grows 2x+ (scale no longer blocked)
- ✅ Event frequency per chapter increases (no waiting for "time slot")
- ✅ Global attendance grows (more time zones accommodated)

---

## Challenges & Solutions

### Challenge 1: Attendee Routing Confusion

**Issue**: If attendee bookmarks `/` and multiple events are live, which do they see?

**Solution**:
- Root `/` shows selector if multiple events (clear choice)
- Encourage chapters to share direct URLs: `/{eventUrl}`
- Event URLs are already in use (emails, calendar invites)
- Backwards compatible: if only 1 event, show it directly

### Challenge 2: Admin Error Handling

**Issue**: Admin tries to control event, but eventId not in Redis (expired or never started)

**Solution**:
```typescript
// Clear error message
if (!currentEvent) {
  return (
    <Alert>
      This event is not currently live.
      <Button onClick={() => startEvent(eventId)}>Start Event</Button>
    </Alert>
  );
}
```

### Challenge 3: Redis Memory Growth

**Issue**: If events don't expire, Redis fills up with stale `currentEvent:*` keys

**Solution**:
- Auto-expire after 2 hours (events rarely last longer)
- Manual cleanup: when admin ends event, delete key immediately
- Monitor: Add metric for # of active events
- Worst case: weekly SCAN + cleanup job

### Challenge 4: Migration from Old Pattern

**Issue**: Existing code might call `getCurrentEvent()` without `eventId`

**Solution**: Clean cutover approach
- Update all call sites in same PR (10 files)
- No gradual migration (cleaner, less error-prone)
- Run full test suite before deploying
- Deploy during low-traffic window (non-event time)

### Challenge 5: Debugging Multi-Event Issues

**Issue**: Hard to see which events are active in Redis

**Solution**: Add admin debug view
```typescript
// New endpoint for org admins
getRedisDebugInfo: protectedProcedure.query(async () => {
  const activeEventIds = await kv.smembers("activeEvents");
  const events = await Promise.all(
    activeEventIds.map(async (id) => ({
      id,
      state: await kv.get(`currentEvent:${id}`),
      ttl: await kv.ttl(`currentEvent:${id}`),
    }))
  );
  return events;
});
```

---

## Role-Based Access (Chapter Lead Isolation)

### The Need

With concurrent events, we need to ensure:
- **Chapter Leads** can only control their own chapter's events
- **Org Admins** can control any event
- **Read access** is appropriately scoped

### Implementation

**Add role check to tRPC procedures**:

```typescript
// src/server/api/routers/event.ts

// Helper: Check if user can admin this event
async function canAdminEvent(userId: string, eventId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { 
      role: true,  // 'org_admin' | 'chapter_lead'
      chapterId: true  // null for org_admin
    }
  });
  
  if (!user) return false;
  if (user.role === 'org_admin') return true;  // Org admins can access all
  
  // Chapter leads: check event belongs to their chapter
  if (user.role === 'chapter_lead') {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { chapterId: true }
    });
    return event?.chapterId === user.chapterId;
  }
  
  return false;
}

// Apply to procedures
setCurrentEvent: protectedProcedure
  .input(z.object({ eventId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    // Check permission
    if (!await canAdminEvent(ctx.session.user.id, input.eventId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You don't have permission to control this event"
      });
    }
    
    // Proceed...
  }),
```

**Database Schema Addition** (for role system):

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  
  // NEW: Role-based access
  role          UserRole  @default(CHAPTER_LEAD)
  chapterId     String?   // null for org admins
  chapter       Chapter?  @relation(fields: [chapterId], references: [id])
  
  accounts      Account[]
  sessions      Session[]
}

enum UserRole {
  ORG_ADMIN      // Full access to all chapters/events
  CHAPTER_LEAD   // Limited to their chapter
}

model Chapter {
  id     String  @id @default(cuid())
  name   String  @unique
  emoji  String
  city   String?
  hidden Boolean @default(false)
  
  events Event[]
  users  User[]   // Chapter leads assigned to this chapter
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Migration needed**:
```sql
-- Add role column
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'CHAPTER_LEAD';
ALTER TABLE "User" ADD COLUMN "chapterId" TEXT;

-- Add foreign key
ALTER TABLE "User" ADD CONSTRAINT "User_chapterId_fkey" 
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id");

-- Set existing users as org admins (or assign to chapters as needed)
UPDATE "User" SET "role" = 'ORG_ADMIN' WHERE email IN ('admin@example.com');
```

**Impact**: Adds ~1 hour to implementation (migration + permissions)

---

## Future Enhancements

### Phase 2: Cross-Chapter Dashboard

Once concurrent events work, build a dashboard to monitor them:

**Route**: `/admin/chapters`

**Features**:
1. **Real-Time Status Grid**
   ```
   ┌─────────────────────────────────────────┐
   │ SF         │ Live - Voting Phase  (45)  │
   │ NYC        │ Live - Demos Phase   (32)  │
   │ London     │ Offline - Next: Mar 15     │
   │ Singapore  │ Offline - Next: Mar 18     │
   └─────────────────────────────────────────┘
   ```

2. **Quick Actions**
   - Jump to any live event's admin view
   - See attendee count in real-time
   - Emergency "End All Events" button

3. **Analytics** (future)
   - Compare metrics across chapters
   - Historical trends per chapter
   - Leaderboards

**Effort**: 2-3 hours (builds on this foundation)

### Phase 3: Smart Event Discovery

For attendees who land on `/` with multiple events:

- **Geo-location**: "You're in SF, join SF Demo Night?"
- **Registration history**: "You attended NYC last time, join them again?"
- **Time-based**: Show events starting soonest first

**Effort**: 2-4 hours

### Phase 4: Event Clustering

For mega-events (e.g., "Global Demo Day"):

- Multiple chapters collaborate on one logical event
- Each chapter has their own demos, but shared voting
- Requires `eventCluster` concept in Redis

**Effort**: 8-10 hours (significant feature)

---

## Why This Feature Now?

### Timing

**Current State**: 
- Chapter system just launched (Nov 24, 2025 migration)
- Multiple chapters now exist in system
- No immediate blocking need, but...

**Near-Term Risk**:
- If 2-3 chapters schedule events in same week, collision likely
- Manual coordination doesn't scale
- One incident of "wrong event showing" would erode trust

**Window of Opportunity**:
- Refactor now before more chapters onboard
- Clean cutover easier with fewer active users
- Sets foundation for growth

### Strategic Value

**Enables Scale**:
- From 3 chapters → 50 chapters without architectural rewrite
- No artificial limits on event scheduling
- Natural multi-region expansion

**Competitive Advantage**:
- Most demo night platforms are single-instance
- Multi-chapter coordination is a differentiator
- "Follow-the-sun" events are novel

**De-Risks Growth**:
- Removes bottleneck before it becomes painful
- Prevents emergency refactor under pressure
- Clean architecture easier to maintain

### Low Risk, High Reward

**Risk Profile**:
- Small, focused change (10 files, 3 hours)
- No UI changes (invisible to users)
- Backwards compatible (single event still works)
- Can rollback easily (Redis-only change)

**Reward**:
- Unlimited concurrent events
- No scheduling coordination needed
- Foundation for cross-chapter features
- Proves architecture scales

**ROI**: 3 hours of dev time for infinite scale capacity

---

## Conclusion

### The Bottleneck

The Demo Night App currently has a **single-event architectural ceiling**. Only one event can be "live" at a time. This works for 1-2 chapters with coordinated schedules, but breaks at scale. The limitation is artificial—it's a Redis key pattern choice, not a fundamental constraint.

### The Solution

**Event-scoped Redis keys**: Replace `"currentEvent"` with `"currentEvent:{eventId}"`. This simple pattern change:
- ✅ Supports unlimited concurrent events
- ✅ Eliminates scheduling conflicts
- ✅ Isolates state per event (no collision)
- ✅ Adds auto-expiry for cleanup
- ✅ Requires **zero UI changes** (already have eventId in URLs)

### The Implementation

**3 hours of focused work**:
1. Refactor 3 Redis functions (30min)
2. Update 10 call sites with eventId (1.5hr)
3. Add role-based permissions (1hr)
4. Test multi-event scenario (30min)

**Zero breaking changes**: Backwards compatible with single-event use case.

### The Impact

**Immediate**:
- SF and NYC can run events simultaneously without conflict
- Admins control their events independently
- Attendees always see the correct event

**Medium-Term** (3-6 months):
- Support 5-10 chapters without coordination overhead
- Enable "follow-the-sun" global demo days
- Foundation for cross-chapter analytics dashboard

**Long-Term** (1+ year):
- Scale to 50+ chapters globally
- Multi-region expansion (Asia, Europe, Americas)
- Event clustering for mega-events

### Why It Matters

✅ **Removes growth bottleneck** before it becomes painful  
✅ **Low effort, high leverage** (3 hours → infinite scale)  
✅ **Differentiates platform** (true multi-chapter support)  
✅ **Enables future features** (analytics, global events)  
✅ **Clean architecture** (scales naturally, no rewrites)

---

**Feature**: Concurrent Multi-Event Support  
**Status**: Proposed  
**Effort**: ~3 hours (+ 1hr for role-based access)  
**Value**: Unlimited scale, eliminates bottleneck  
**Risk**: Low (Redis-only, backwards compatible)  
**Dependencies**: None (pure refactor)

---

**Ready to implement when**: Multi-chapter events need to run simultaneously, or as proactive infrastructure for scale.

