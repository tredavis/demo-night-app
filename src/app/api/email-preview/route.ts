import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/components";
import SubmissionConfirmationEmail from "~/emails/SubmissionConfirmationEmail";
import SubmissionStatusUpdateEmail from "~/emails/SubmissionStatusUpdateEmail";

export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not available in production", { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const template = searchParams.get("template");
  const status = searchParams.get("status") as "CONFIRMED" | "REJECTED" | "WAITLISTED";

  // Mock data for preview
  const mockEvent = {
    name: "Demo Night SF - January 2025",
  };
  
  const mockSubmission = {
    name: "AI-Powered Code Assistant",
    tagline: "Your intelligent pair programming partner",
    pocName: "Jane Developer",
  };

  let html = "";

  try {
    if (template === "confirmation") {
      html = render(
        SubmissionConfirmationEmail({
          eventName: mockEvent.name,
          submissionName: mockSubmission.name,
          tagline: mockSubmission.tagline,
          pocName: mockSubmission.pocName,
          manageLink: "https://demos.aicollective.com/event/123",
        })
      );
    } else if (template === "status") {
      html = render(
        SubmissionStatusUpdateEmail({
          eventName: mockEvent.name,
          submissionName: mockSubmission.name,
          pocName: mockSubmission.pocName,
          status: status || "CONFIRMED",
          manageLink: "https://demos.aicollective.com/event/123",
          guidanceText: status === "CONFIRMED" 
            ? "We'll send you more details about the event schedule and logistics soon."
            : undefined,
        })
      );
    } else {
      html = "<p>Invalid template selected</p>";
    }
  } catch (error) {
    console.error("Failed to render email template:", error);
    html = `<p>Error rendering template: ${error}</p>`;
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}
