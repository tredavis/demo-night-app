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

type SubmissionConfirmationEmailProps = {
  eventName: string;
  submissionName: string;
  tagline?: string | null;
  pocName: string;
  manageLink?: string;
};

export function SubmissionConfirmationEmail({
  eventName,
  submissionName,
  tagline,
  pocName,
  manageLink = "https://demos.aicollective.com",
}: SubmissionConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>
            Thanks for submitting to {eventName}!
          </Heading>
          <Text style={textStyle}>Hi {pocName},</Text>
          <Text style={textStyle}>
            We received your demo submission <strong>{submissionName}</strong>
            {tagline ? ` — “${tagline}”` : ""}. Our team will review it soon
            and follow up with next steps.
          </Text>
          <Text style={textStyle}>
            Need to make an update or have questions? Use the link below to view
            the event details or reply to this email.
          </Text>
          <Section style={buttonRowStyle}>
            <Button href={manageLink} style={buttonStyle}>
              View Event Info
            </Button>
          </Section>
          <Text style={footerStyle}>
            — Demo Night App Team • demos.aicollective.com
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

const buttonStyle: React.CSSProperties = {
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

export default SubmissionConfirmationEmail;

