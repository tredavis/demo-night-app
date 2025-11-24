import * as React from "react";
import { Resend } from "resend";

import SubmissionConfirmationEmail from "~/emails/SubmissionConfirmationEmail";
import SubmissionStatusUpdateEmail from "~/emails/SubmissionStatusUpdateEmail";
import { env } from "~/env";

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const defaultFrom =
  env.RESEND_FROM_EMAIL ?? "Demo Night <onboarding@resend.dev>";

type SubmissionInfo = {
  id: string;
  name: string;
  tagline?: string | null;
  pocName: string;
  email: string;
};

type EventInfo = {
  id: string;
  name: string;
  url?: string | null;
};

type StatusChangeInfo = SubmissionInfo & {
  status: "CONFIRMED" | "REJECTED" | "WAITLISTED";
};

function logSkipped(reason: string) {
  console.warn(`[email] skipped: ${reason}`);
}

function logError(action: string, error: unknown) {
  console.error(`[email] ${action} failed`, error);
}

export async function sendSubmissionConfirmation(params: {
  submission: SubmissionInfo;
  event: EventInfo;
  manageLink?: string;
}) {
  if (!resendClient) {
    logSkipped("Resend not configured (missing RESEND_API_KEY)");
    return;
  }

  const { submission, event, manageLink } = params;

  try {
    await resendClient.emails.send({
      from: defaultFrom,
      to: submission.email,
      subject: `We received your ${event.name} submission`,
      react: (
        <SubmissionConfirmationEmail
          eventName={event.name}
          submissionName={submission.name}
          tagline={submission.tagline}
          pocName={submission.pocName}
          manageLink={manageLink}
        />
      ),
    });
    console.info(
      `[email] submission confirmation sent for submission ${submission.id}`,
    );
  } catch (error) {
    logError("sendSubmissionConfirmation", error);
  }
}

export async function sendSubmissionStatusUpdate(params: {
  submission: StatusChangeInfo;
  event: EventInfo;
  manageLink?: string;
  guidanceText?: string;
}) {
  if (!resendClient) {
    logSkipped("Resend not configured (missing RESEND_API_KEY)");
    return;
  }

  const { submission, event, manageLink, guidanceText } = params;

  try {
    await resendClient.emails.send({
      from: defaultFrom,
      to: submission.email,
      subject: `${event.name} submission update`,
      react: (
        <SubmissionStatusUpdateEmail
          eventName={event.name}
          submissionName={submission.name}
          pocName={submission.pocName}
          status={submission.status}
          manageLink={manageLink}
          guidanceText={guidanceText}
        />
      ),
    });
    console.info(
      `[email] submission status email sent for submission ${submission.id}`,
    );
  } catch (error) {
    logError("sendSubmissionStatusUpdate", error);
  }
}

