import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import readline from "readline";
import path from "path";

type Pending = {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
};

type ChatResult = {
  responseText: string;
  status: "ongoing" | "finished" | string;
  audioBase64: string | null;
};

type FeedbackResult = {
  score?: number;
  summary?: string;
  advice?: string;
  good_points?: string[];
  bad_points?: string[];
  detailed_analysis?: any;
};

type TranscribeResult = {
  transcript?: string | null;
};

class SimulatorClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private initialized = new Set<number>();

  private start() {
    if (this.proc) return;

    const python = process.env.SIMULATOR_PYTHON || "python";
    const bridgePath =
      process.env.SIMULATOR_BRIDGE ||
      path.resolve(process.cwd(), "scripts", "simulator_bridge.py");

    this.proc = spawn(python, [bridgePath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        const id = msg.id;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        if (msg.ok) {
          pending.resolve(msg);
        } else {
          pending.reject(new Error(msg.error || "Simulator error"));
        }
      } catch (err: any) {
        // ignore parse errors
      }
    });

    this.proc.stderr.on("data", (buf) => {
      const text = buf.toString().trim();
      if (text) console.error("[simulator]", text);
    });

    this.proc.on("exit", () => {
      this.proc = null;
      this.pending.forEach((p) => p.reject(new Error("Simulator process exited")));
      this.pending.clear();
      this.initialized.clear();
    });
  }

  private send(payload: any): Promise<any> {
    this.start();
    const id = this.nextId++;
    payload.id = id;
    const proc = this.proc!;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      proc.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  async ensureInit(sessionId: number, userProfileJson?: string) {
    if (this.initialized.has(sessionId)) return;
    const profile =
      userProfileJson || '{"user_profile": {"name": "사용자", "scenario_type": "default"}}';
    await this.send({ action: "init", sessionId, userProfile: profile });
    this.initialized.add(sessionId);
  }

  async chatTurn(sessionId: number, userInput: string, userProfileJson?: string): Promise<ChatResult> {
    await this.ensureInit(sessionId, userProfileJson);
    const res = await this.send({ action: "chat", sessionId, userInput, userProfile: userProfileJson });
    return {
      responseText: res.responseText,
      status: res.status,
      audioBase64: res.audioBase64 ?? null,
    };
  }

  async feedback(sessionId: number, userProfileJson?: string): Promise<FeedbackResult> {
    await this.ensureInit(sessionId, userProfileJson);
    const res = await this.send({ action: "feedback", sessionId, userProfile: userProfileJson });
    return (res.feedback ?? {}) as FeedbackResult;
  }

  async transcribe(
    sessionId: number,
    audioUrl: string,
    userProfileJson?: string
  ): Promise<TranscribeResult> {
    await this.ensureInit(sessionId, userProfileJson);
    const res = await this.send({ action: "transcribe", sessionId, audioUrl, userProfile: userProfileJson });
    return { transcript: res.transcript ?? null };
  }
}

const client = new SimulatorClient();

export async function simulatorChatTurn(input: {
  sessionId: number;
  userInput: string;
  userProfileJson?: string;
}): Promise<ChatResult> {
  return client.chatTurn(input.sessionId, input.userInput, input.userProfileJson);
}

export async function simulatorFeedback(input: {
  sessionId: number;
  userProfileJson?: string;
}): Promise<FeedbackResult> {
  return client.feedback(input.sessionId, input.userProfileJson);
}

export async function simulatorTranscribe(input: {
  sessionId: number;
  audioUrl: string;
  userProfileJson?: string;
}): Promise<string | null> {
  const res = await client.transcribe(input.sessionId, input.audioUrl, input.userProfileJson);
  return res.transcript ?? null;
}
