import { config } from "dotenv";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";
import type { RealtimeNotification } from "../src/lib/realtime/types";

config({ path: ".env.local" });
config();

const port = Number(process.env.SOCKET_PORT || 3002);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const emitSecret = process.env.SOCKET_SECRET || serviceKey || "";

if (!supabaseUrl || !anonKey || !serviceKey) {
  console.error("Socket server missing Supabase env vars.");
  process.exit(1);
}

const authClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const connectionCounts = new Map<string, number>();

function onlineEmployeeIds() {
  return Array.from(connectionCounts.keys());
}

async function readJson(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
  } catch {
    return null;
  }
}

function unauthorized(res: import("node:http").ServerResponse) {
  res.writeHead(401);
  res.end("unauthorized");
}

function isAuthorized(req: import("node:http").IncomingMessage) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(emitSecret && token === emitSecret);
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, online: onlineEmployeeIds().length }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/notify") {
    if (!isAuthorized(req)) {
      unauthorized(res);
      return;
    }

    const payload = await readJson(req);
    if (!payload) {
      res.writeHead(400);
      res.end("invalid json");
      return;
    }

    const notifications = (payload.notifications ?? []) as RealtimeNotification[];
    for (const notification of notifications) {
      io.to(`employee:${notification.employeeId}`).emit("notification", notification);
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/emit") {
    if (!isAuthorized(req)) {
      unauthorized(res);
      return;
    }

    const payload = await readJson(req);
    if (!payload) {
      res.writeHead(400);
      res.end("invalid json");
      return;
    }

    const event = String(payload.event || "");
    const employeeIds = Array.isArray(payload.employeeIds)
      ? payload.employeeIds.map((id) => String(id))
      : [];
    if (!event || employeeIds.length === 0) {
      res.writeHead(400);
      res.end("invalid payload");
      return;
    }

    for (const employeeId of employeeIds) {
      io.to(`employee:${employeeId}`).emit(event, payload.payload);
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true,
  },
});

io.use(async (socket, next) => {
  try {
    const token = String(socket.handshake.auth?.token || "");
    if (!token) {
      next(new Error("Missing token"));
      return;
    }

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(token);
    if (error || !user) {
      next(new Error("Invalid token"));
      return;
    }

    const { data: employee } = await service
      .from("employees")
      .select("id, employment_status")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!employee || employee.employment_status === "SUSPENDED" || employee.employment_status === "TERMINATED") {
      next(new Error("Blocked"));
      return;
    }

    socket.data.employeeId = employee.id;
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error("Auth failed"));
  }
});

io.on("connection", (socket) => {
  const employeeId = socket.data.employeeId as string;
  socket.join(`employee:${employeeId}`);

  const nextCount = (connectionCounts.get(employeeId) ?? 0) + 1;
  connectionCounts.set(employeeId, nextCount);
  if (nextCount === 1) {
    io.emit("presence:update", { employeeId, online: true });
  }
  socket.emit("presence:snapshot", onlineEmployeeIds());

  socket.on("chat:typing", (data: { toEmployeeId?: string } | null) => {
    const toEmployeeId = String(data?.toEmployeeId || "");
    if (!toEmployeeId || toEmployeeId === employeeId) return;
    io.to(`employee:${toEmployeeId}`).emit("chat:typing", { fromEmployeeId: employeeId });
  });

  socket.on("disconnect", () => {
    const remaining = (connectionCounts.get(employeeId) ?? 1) - 1;
    if (remaining <= 0) {
      connectionCounts.delete(employeeId);
      io.emit("presence:update", { employeeId, online: false });
    } else {
      connectionCounts.set(employeeId, remaining);
    }
  });
});

httpServer.listen(port, () => {
  console.log(`Socket.io realtime on http://127.0.0.1:${port}`);
});
