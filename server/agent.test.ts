import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { reply } from "./agent.ts";
import { createJsonTaskStore } from "./task-store.ts";

function ask(tasks: ReturnType<typeof createJsonTaskStore>, content: string) {
  return reply([{ role: "user", content }], tasks);
}

test("小明用中文创建、查看、完成和删除待办", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "todo-agent-agent-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tasks = createJsonTaskStore(join(directory, "tasks.json"));

  assert.match(await ask(tasks, "帮我记一下买牛奶"), /已记下待办“买牛奶”/);
  assert.match(await ask(tasks, "再记一条取快递"), /已记下待办“取快递”/);
  assert.match(await ask(tasks, "我有哪些任务？"), /\[待办\] 买牛奶[\s\S]*\[待办\] 取快递/);
  assert.match(await ask(tasks, "牛奶买好了"), /标记为已完成/);
  assert.match(await ask(tasks, "取快递这条删掉吧"), /已删除待办“取快递”/);
  assert.match(await ask(tasks, "再给我看看清单"), /\[已完成\] 买牛奶/);
  assert.equal(tasks.list().length, 1);
  assert.equal(tasks.list()[0].done, true);
});
