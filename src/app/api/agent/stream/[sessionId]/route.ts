import { NextRequest } from "next/server";
import { AGENT_URL, agentHeaders } from "@/lib/agent/eve-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const startIndex = req.nextUrl.searchParams.get("startIndex") ?? "0";

  // Attach to eve's durable NDJSON event stream and re-emit each line as an SSE frame.
  const upstream = await fetch(
    `${AGENT_URL}/eve/v1/session/${sessionId}/stream?startIndex=${startIndex}`,
    { headers: agentHeaders() },
  );
  if (!upstream.ok || !upstream.body) {
    return new Response(
      `event: error\ndata: "agent stream unavailable (${upstream.status})"\n\n`,
      { status: 502, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep the partial trailing line
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed)
              controller.enqueue(encoder.encode(`data: ${trimmed}\n\n`));
          }
        }
        if (buffer.trim()) {
          controller.enqueue(encoder.encode(`data: ${buffer.trim()}\n\n`));
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify(String(e))}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
