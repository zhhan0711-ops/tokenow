import type { ChatMessage } from "../shared/chat.ts";
import type { TaskStore } from "./task-store.ts";

export type { ChatMessage } from "../shared/chat.ts";

type Task = ReturnType<TaskStore["list"]>[number];

const filler = /^(?:帮我|请|麻烦|给我|再|一下|一条|把|将|我要|我想)(?:帮我)?/;
const ending = /(?:这条|这个|任务|待办|一下|吧|呀|啊|喽|了)+$/;

function cleanTitle(value: string) {
  return value
    .replace(/[，。！？；、,.!?;]/g, " ")
    .replace(filler, "")
    .replace(ending, "")
    .trim();
}

function renderList(tasks: Task[]) {
  if (tasks.length === 0) return "目前清单是空的。你可以说“帮我记一下买牛奶”。";
  return [
    "当前待办清单：",
    ...tasks.map(
      (task, index) => `${index + 1}. ${task.done ? "[已完成]" : "[待办]"} ${task.title}`,
    ),
  ].join("\n");
}

/** Find a task even when Chinese word order differs, e.g. “牛奶买好了” -> “买牛奶”. */
function findTask(tasks: Task[], description: string) {
  const query = cleanTitle(description).replace(/\s/g, "");
  if (!query) return undefined;
  const exact = tasks.find(
    (task) => task.title === query || task.title.includes(query) || query.includes(task.title),
  );
  if (exact) return exact;

  const ranked = tasks
    .map((task) => {
      const title = task.title.replace(/\s/g, "");
      const shared = [...new Set(query)].filter((character) => title.includes(character)).length;
      return { task, score: shared / Math.max(new Set(query).size, new Set(title).size) };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 0.6 ? ranked[0].task : undefined;
}

function createTitle(message: string) {
  const match = message.match(
    /(?:记(?:一下|一条)?|添加|新增|创建)(?:一个|一条)?(?:待办|任务)?\s*(.+)$/,
  );
  return match ? cleanTitle(match[1]) : "";
}

function targetForCompletion(message: string) {
  const colloquial = message.match(/^(?:请|帮我|把|将)?\s*(.+?)(?:好了|完了)[。！？!？]?$/);
  if (colloquial) return cleanTitle(colloquial[1]);
  const leading = message.match(
    /^(?:请|帮我|把|将)?\s*(.+?)(?:标记为)?(?:已)?(?:完成|做好|办好)(?:了)?[。！？!？]?$/,
  );
  return leading ? cleanTitle(leading[1]) : "";
}

function targetForDeletion(message: string) {
  const trailing = message.match(
    /^(.+?)(?:这条|这个)?(?:任务|待办)?\s*(?:删掉|删除|移除|去掉)(?:一下)?[吧呀啊。！？!？]?$/,
  );
  if (trailing) return cleanTitle(trailing[1]);
  const leading = message.match(
    /^(?:请|帮我|把|将)?\s*(?:删掉|删除|移除|去掉)(?:这条|这个)?(?:任务|待办)?\s*(.+)$/,
  );
  return leading ? cleanTitle(leading[1]) : "";
}

// messages 包含本轮对话历史，最后一条是最新的用户消息。任务始终由 TaskStore
// 读写，因而刷新页面、重启服务后仍可查询；不需要模型密钥也可验证基础能力。
export async function reply(messages: ChatMessage[], tasks: TaskStore): Promise<string> {
  const message = messages.at(-1)?.content.trim() ?? "";

  const deletion = targetForDeletion(message);
  if (deletion) {
    const task = findTask(tasks.list(), deletion);
    if (!task) return `没有找到“${deletion}”。${renderList(tasks.list())}`;
    tasks.remove(task.id);
    return `已删除待办“${task.title}”。`;
  }

  const completion = targetForCompletion(message);
  if (completion) {
    const task = findTask(tasks.list(), completion);
    if (!task) return `没有找到“${completion}”，所以没有修改清单。`;
    if (task.done) return `“${task.title}”本来就是已完成状态。`;
    tasks.update(task.id, { done: true });
    return `太好了，已将“${task.title}”标记为已完成。`;
  }

  const title = createTitle(message);
  if (title) {
    const task = tasks.create(title);
    return `已记下待办“${task.title}”。`;
  }

  if (
    /(?:有哪些|什么).*?(?:任务|待办)|(?:任务|待办|清单).*(?:有哪些|查看|看看|列出)|(?:查看|看看|列出).*(?:任务|待办|清单)|^(?:查看|看看|列出)/.test(
      message,
    )
  ) {
    return renderList(tasks.list());
  }

  return "我可以帮你管理待办：说“帮我记一下洗衣服”、 “我有哪些任务？”、 “衣服洗好了”或“删除洗衣服”。";
}
