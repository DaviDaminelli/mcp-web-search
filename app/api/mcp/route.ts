import { createMcpHandler } from "mcp-handler";
import { registerTools } from "@/lib/mcp-server";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: {
      name: "mcp-web-search",
      version: "1.0.0",
    },
    verboseLogs: process.env.NODE_ENV === "development",
  }
);

export { handler as GET, handler as POST };
