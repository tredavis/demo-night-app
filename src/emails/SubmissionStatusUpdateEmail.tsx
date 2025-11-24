import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

type SubmissionStatus = "CONFIRMED" | "REJECTED" | "WAITLISTED";

type SubmissionStatusUpdateEmailProps = {
  eventName: string;
  submissionName: string;
  pocName: string;
  status: SubmissionStatus;
  guidanceText?: string;
  manageLink?: string;
};

const statusCopy: Record<
  SubmissionStatus,
  { heading: string; summary: string; button: string; variant: "dark" | "light" }
> = {
  CONFIRMED: {
    heading: "You're on the agenda!",
    summary: "We can't wait to showcase your demo at the event.",
    button: "Review Event Details",
    variant: "dark",
  },
  REJECTED: {
    heading: "Thanks for submitting",
    summary:
      "We had a high volume of demos and weren’t able to fit this one in.",
    button: "Follow Up",
    variant: "light",
  },
  WAITLISTED: {
    heading: "You're on the waitlist",
    summary:
      "We’ll reach out if a slot opens up or if we can spotlight your work elsewhere.",
    button: "Stay Updated",
    variant: "light",
  },
};

export function SubmissionStatusUpdateEmail({
  eventName,
  submissionName,
  pocName,
  status,
  guidanceText,
  manageLink = "https://demos.aicollective.com",
}: SubmissionStatusUpdateEmailProps) {
  const copy = statusCopy[status];
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>
            {eventName}: {copy.heading}
          </Heading>
          <Text style={textStyle}>Hi {pocName},</Text>
          <Text style={textStyle}>
            <strong>{submissionName}</strong> — {copy.summary}
          </Text>
          <Text style={textStyle}>
            {guidanceText ??
              (status === "CONFIRMED"
                ? "You’ll receive final logistics soon. In the meantime, review the event details and prepare your shareable assets."
                : "We appreciate the time you spent applying and hope to stay in touch for future events.")}
          </Text>
          <Section style={buttonRowStyle}>
            <Button
              href={manageLink}
              style={
                copy.variant === "dark"
                  ? buttonStyleDark
                  : { ...buttonStyleDark, backgroundColor: "#f3f4f6", color: "#111827" }
              }
            >
              {copy.button}
            </Button>
          </Section>
          <Text style={footerStyle}>
            Have questions? Reply to this email or visit demos.aicollective.com.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  padding: "24px 0",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  margin: "0 auto",
  padding: "40px 32px",
  width: "100%",
  maxWidth: "520px",
  border: "1px solid #e5e7eb",
};

const headingStyle: React.CSSProperties = {
  fontSize: "24px",
  margin: "0 0 16px",
};

const textStyle: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "1.5",
  color: "#111827",
  margin: "0 0 16px",
};

const buttonRowStyle: React.CSSProperties = {
  margin: "24px 0",
  textAlign: "center",
};

const buttonStyleDark: React.CSSProperties = {
  backgroundColor: "#111827",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  padding: "12px 28px",
  textDecoration: "none",
};

const footerStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  marginTop: "24px",
};

export default SubmissionStatusUpdateEmail;

