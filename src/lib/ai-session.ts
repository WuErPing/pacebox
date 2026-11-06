import {
  AiRequestError,
  buildTranscriptDigest,
  requestAiScore,
} from "@/lib/ai-scoring";
import type { RehearsalSession } from "@/lib/rehearsal-types";
import { useAiConfigStore } from "@/store/ai-config";
import { useHistoryStore } from "@/store/history";

/**
 * 读取 session -> 请求 LLM 评分 -> 回写历史（列表徽标同步刷新）。
 * 返回更新后的 session；记录不存在或外部 abort 时返回 null。
 */
export async function scoreSession(
  id: string,
  signal?: AbortSignal,
): Promise<RehearsalSession | null> {
  const history = useHistoryStore.getState();
  const session = await history.loadSession(id);
  if (!session) return null;

  await history.updateSession({
    ...session,
    aiStatus: "pending" as const,
    aiError: null,
  });

  const cfg = useAiConfigStore.getState().config;
  try {
    const score = await requestAiScore(
      cfg,
      {
        settings: session.settings,
        completedNaturally: session.completedNaturally,
        totalElapsedMs: session.totalElapsedMs,
        metrics: session.metrics,
        lang: session.metrics?.lang ?? null,
        transcript: buildTranscriptDigest(session.segments),
      },
      signal,
    );
    const done: RehearsalSession = {
      ...session,
      aiStatus: "done",
      aiScore: score,
      aiError: null,
    };
    await history.updateSession(done);
    return done;
  } catch (e) {
    if (signal?.aborted) return null;
    const failed: RehearsalSession = {
      ...session,
      aiStatus: "error",
      aiScore: null,
      aiError:
        e instanceof AiRequestError ? e.message : "评分失败，请重试",
    };
    await history.updateSession(failed);
    return failed;
  }
}
