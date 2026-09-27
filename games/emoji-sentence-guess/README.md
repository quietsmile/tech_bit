# 🤔 Emoji 猜趣味句子

一个纯 HTML / CSS / JavaScript 的中文猜句小游戏：看一串 Emoji，从 4 个中文选项里找出正确句子。全部代码本地运行，不依赖外部 CDN。

## 🎮 关卡规则

- 共 **10 关**。
- 第 1 关显示 **1 个 Emoji**，第 10 关显示 **10 个 Emoji**。
- 自动从第 1 关开始，不能手动选关。
- 每关随机出 **1 题**，每次开局都会重新随机生成。第 1 关限时 **20 秒**，之后每答对一关，就把剩余时间＋20 秒累计带入下一关。
- 答对进入下一关，答错或超时结束挑战，结果记录到达的关卡。
- 答对得分：基础分 + 连击奖励 + 剩余时间奖励。
- 答错或超时会清空连击。

## 📁 文件结构

```text
emoji-sentence-guess/
├── index.html     # 页面入口和选关界面
├── style.css      # 样式
├── game.js        # 游戏逻辑
├── questions.js   # 按关卡随机生成题目
├── validate.js    # 生成结果校验脚本
└── README.md
```

## ✅ 开发自测

```bash
node --check questions.js
node --check game.js
node --check validate.js
node validate.js
```

校验脚本会随机生成 20 关各 10 轮题目，确认每一题的 Emoji 数量都等于关卡数，并且选项、答案、分类和解释格式正确。
