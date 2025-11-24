"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

export default function EmailPreviewPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<"confirmation" | "status">("confirmation");
  const [selectedStatus, setSelectedStatus] = useState<"CONFIRMED" | "REJECTED">("CONFIRMED");
  const [emailHtml, setEmailHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        template: selectedTemplate,
        ...(selectedTemplate === "status" && { status: selectedStatus }),
      });
      
      const response = await fetch(`/api/email-preview?${params}`);
      const html = await response.text();
      setEmailHtml(html);
    } catch (error) {
      console.error("Failed to load preview:", error);
      setEmailHtml("<p>Error loading preview</p>");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Email Template Preview</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Template Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Template</label>
              <Select value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmation">Submission Confirmation</SelectItem>
                  <SelectItem value="status">Status Update</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {selectedTemplate === "status" && (
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <Button onClick={loadPreview} disabled={loading}>
              {loading ? "Loading..." : "Load Preview"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {emailHtml && (
        <Card>
          <CardHeader>
            <CardTitle>Email Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg bg-gray-50 p-4">
              <iframe
                srcDoc={emailHtml}
                className="w-full h-[600px] bg-white rounded"
                title="Email Preview"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
