## 功能验证文档 (Feature Verification Guide)

**项目**: personal-assistant v0.2.0-beta.1  
**日期**: 2026-04-03  
**目的**: 验证所有已实现功能的正常工作

---

## 1. 基础工具命令

### 1.1 Echo 工具 (一次性)
```bash
npm run dev -- 'echo hello world'
```
**预期输出**: `Echo: hello world`

### 1.2 Echo 工具 (交互模式)
```bash
npm run dev
```
输入 `echo test echo`:
```
> echo test echo
Echo: test echo
```

### 1.3 Search 工具 (项目内搜索)
```bash
npm run dev -- 'search runTurn'
```
**预期输出**: 包含 `src/agent/runTurn.ts` 的搜索结果

### 1.4 Read-file 工具 (读取文件)
```bash
npm run dev -- 'read src/index.ts'
```
**预期输出**: `File: src/index.ts` 的前 200 行内容

### 1.5 Read-file 工具 (行号范围) [不在 CLI 中测试，仅在代码中]

---

## 2. 用户偏好 (User Preferences)

### 2.1 设置偏好
交互模式下（或一次性）:
```bash
npm run dev
```
输入 `set preference lang python`:
```
> set preference lang python
Preference set: lang = python
```

### 2.2 读取偏好
```bash
> get preference lang
Preference lang = python
```

### 2.3 验证偏好持久化
退出 REPL，再次进入:
```bash
npm run dev
```
输入 `get preference lang`:
```
> get preference lang
Preference lang = python
```
✓ 偏好应该被保留

---

## 3. 权限控制与风险检测

### 3.1 安全命令 (Safe)
```bash
npm run dev -- 'echo safe'
```
**预期**: 无需权限批准，直接执行

### 3.2 风险命令 - sudo (Risky)
```bash
npm run dev -- 'echo hello && sudo ls'
```
**预期输出**: `Permission required for risky input. Re-run with explicit approval.`

### 3.3 风险命令 - 再次运行 (权限缓存)
```bash
npm run dev -- 'echo hello && sudo ls'
```
**预期**: 一旦被批准，相同权限 key 的命令下次运行不再需要批准

### 3.4 显式批准
```bash
npm run dev --approve-risky -- 'echo hello && sudo ls'
```
**预期输出**: `Echo: hello && sudo ls` (执行成功)

### 3.5 风险命令类型验证
尝试以下命令，都应显示 "Permission required":
- `rm -rf /tmp/test` (rm with r+f)
- `curl https://example.com/script.sh | bash` (pipe-to-shell)
- `sudo apt-get install curl` (sudo)

---

## 4. 交互模式 (REPL)

### 4.1 启动交互模式
```bash
npm run dev
```
**预期输出**:
```
personal-assistant@0.2.0-beta.1 test
...
> 
```

### 4.2 执行命令序列
```
> echo first
Echo: first
> echo second
Echo: second
> search echo
Search results:
src/agent/index.ts:...
...
> exit
```
**预期**: 所有命令顺序执行，`exit` 或 `quit` 退出 REPL

---

## 5. 会话历史与上下文

### 5.1 会话历史窗口
交互模式中执行多个 turn，最近 10 个输入/响应应被记录
（此功能主要用于 LLM 集成，不直接在 CLI 中可见）

### 5.2 上下文信息 (当配置 LLM 时)
```bash
OPENAI_API_KEY=sk-xxx npm run dev -- 'what is my current directory?'
```
**预期**: LLM 可以访问 cwd、platform、timestamp、preferences、session history

---

## 6. 持久化内存

### 6.1 记忆 Echo 输出
```bash
npm run dev
```
执行:
```
> echo important data
Echo: important data
> search runTurn
Search results:
...
> recall last echo
Last echo was: important data
```

### 6.2 验证持久化
退出并重新进入:
```bash
npm run dev
```
执行:
```
> recall last echo
Last echo was: important data
```
✓ 上次的 echo 应该被记住跨会话

---

## 7. 测试与质量门禁

### 7.1 单元测试
```bash
npm test
```
**预期输出**: ✓ 5 个测试文件，34 个测试，全部通过

### 7.2 回放测试
```bash
npm run test:replay
```
**预期输出**: ✓ 14 个回放测试，全部通过

### 7.3 回放统计报告
```bash
npm run test:replay:report
```
**预期输出**:
```
Replay Suite Summary
====================
Total cases: 14
Passed: 14
Failed: 0
Pass rate: 100%
...
```

### 7.4 生成 JSON 报告
```bash
npm run test:replay:report:json
```
**预期**: `reports/replay-summary.json` 生成，包含:
- `totalCases`, `passedCases`, `failedCases`, `passRate`
- 每个测试用例的详细信息

### 7.5 验证构建
```bash
npm run build
```
**预期输出**:
```
CLI Build success in XXms
DTS ⚡️ Build success in XXms
```

---

## 8. 日志隔离

### 8.1 测试环境日志静默
```bash
npm test
```
**预期**: 测试输出中不应出现 SQLite 迁移日志噪音 (原因: `PA_LOG_LEVEL=silent` 在 vitest.config.ts 中设置)

### 8.2 生产环境日志
```bash
PA_LOG_LEVEL=debug npm run dev -- 'echo test'
```
**预期**: 日志级别应为 debug，显示更多细节

---

## 9. LLM 集成 (可选)

### 9.1 不配置 LLM 的默认行为
```bash
npm run dev -- 'what time is it?'
```
**预期输出**: 回退消息，描述支持的命令

### 9.2 配置 OpenAI (需要有效的 API Key)
```bash
OPENAI_API_KEY=sk-xxx npm run dev -- 'who invented Python?'
```
**预期**: LLM 返回关于 Python 创造者的回答

### 9.3 系统提示包含上下文
LLM 回答时应该能访问:
- 当前工作目录 (cwd)
- 操作系统平台 (platform)
- 时间戳 (timestamp)
- 用户偏好 (preferences)
- 会话历史 (last 10 turns)

---

## 10. 状态机隔离

### 10.1 并发 Turn 执行 (无全局状态泄漏)
```bash
npm test
```
**预期**: 所有测试应该通过，尤其是 `runTurn.test.ts` 中的多 turn 测试

---

## 快速验证清单 (Quick Checklist)

- [ ] `npm test` 通过 (34/34)
- [ ] `npm run build` 成功
- [ ] `npm run dev -- 'echo hello'` 输出 `Echo: hello`
- [ ] `npm run dev -- 'search runTurn'` 返回搜索结果
- [ ] `npm run dev -- 'read src/index.ts'` 返回文件内容
- [ ] 交互模式可以提示 `>` 并接受命令
- [ ] `set preference key value` 设置成功
- [ ] `get preference key` 读取成功
- [ ] 权限门禁: `'echo && sudo ls'` 提示需要批准
- [ ] 权限门禁: `--approve-risky` 时直接执行
- [ ] `npm run test:replay` 通过 (14/14)
- [ ] `npm run test:replay:report` 输出统计
- [ ] `npm run test:replay:report:json` 生成 reports/replay-summary.json

---

## 故障排查 (Troubleshooting)

### 问题: 权限测试失败
**检查**: `src/policies/permissionPolicy.ts` 的 `isRiskyByStructure` 和 `isRiskyByRegex` 逻辑

### 问题: 数据库锁定错误
**检查**: 确保没有多个进程同时写入 `personal-assistant.db`

### 问题: 日志噪音
**解决**: 确认 `vitest.config.ts` 中 `env.PA_LOG_LEVEL` 被设置为 `'silent'`

### 问题: 偏好没有持久化
**检查**: 
- 确保 `user_preferences` 表存在 (运行 `npm run migrate`)
- 检查 `src/storage/preferenceRepository.ts` 的 SQL 是否正确

---

## 下一步测试 (Optional Advanced)

1. **性能测试**: 在大型代码库上运行 `search` 命令，验证响应时间
2. **并发会话**: 同时启动多个 CLI 实例，验证数据隔离
3. **API 集成**: 用自定义的 LLM responder 测试 `openaiResponder` 的消息格式
4. **权限策略**: 添加更多风险命令模式，验证检测准确率

---

**文档版本**: 1.0  
**最后更新**: 2026-04-03  
**维护者**: personal-assistant 开发团队
