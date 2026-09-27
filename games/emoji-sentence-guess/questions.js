/* Emoji 猜趣味句子 —— 按关卡随机生成题库
 * 第 1 关使用 1 个 Emoji，第 10 关使用 10 个 Emoji。
 * 每次进入关卡都会重新随机生成，所以同一关的题目不会固定。
 */

var EmojiQuestionBank = (function () {
  "use strict";

  var LEVEL_COUNT = 10;
  var QUESTIONS_PER_LEVEL = 1;

  var SINGLE_STORIES = [
    { emoji: "🌧️", text: "下雨了", category: "天气" },
    { emoji: "🌞", text: "出太阳了", category: "天气" },
    { emoji: "🌈", text: "彩虹出来了", category: "天气" },
    { emoji: "🐶", text: "小狗跑来了", category: "动物" },
    { emoji: "🐱", text: "小猫晒太阳", category: "动物" },
    { emoji: "🍕", text: "在吃披萨", category: "美食" },
    { emoji: "🎂", text: "在吃生日蛋糕", category: "美食" },
    { emoji: "🎁", text: "拆礼物啦", category: "生活" },
    { emoji: "⚽", text: "在踢足球", category: "运动" },
    { emoji: "📚", text: "在认真看书", category: "学习" },
    { emoji: "🚌", text: "公交车到站了", category: "出行" },
    { emoji: "🧸", text: "抱着玩具熊", category: "生活" }
  ];

  var SUBJECTS = [
    { emoji: "🐶", text: "小狗", category: "动物" },
    { emoji: "🐱", text: "小猫", category: "动物" },
    { emoji: "🐰", text: "小兔子", category: "动物" },
    { emoji: "🐼", text: "熊猫", category: "动物" },
    { emoji: "🦊", text: "小狐狸", category: "动物" },
    { emoji: "🐸", text: "青蛙", category: "动物" },
    { emoji: "🧒", text: "小朋友", category: "人物" },
    { emoji: "👨", text: "爸爸", category: "人物" },
    { emoji: "👩", text: "妈妈", category: "人物" },
    { emoji: "🤖", text: "小机器人", category: "科技" },
    { emoji: "🦖", text: "小恐龙", category: "动物" },
    { emoji: "🐧", text: "企鹅", category: "动物" }
  ];

  var PLACES = [
    { emoji: "🏫", text: "在学校", category: "校园" },
    { emoji: "🏠", text: "在家里", category: "生活" },
    { emoji: "🏞️", text: "在郊外", category: "出行" },
    { emoji: "🎡", text: "在游乐园", category: "游玩" },
    { emoji: "🏖️", text: "在沙滩上", category: "出行" },
    { emoji: "🏥", text: "在医院里", category: "生活" },
    { emoji: "🏪", text: "在小卖部", category: "生活" },
    { emoji: "🚉", text: "在火车站", category: "出行" },
    { emoji: "🏬", text: "在百货商店", category: "生活" },
    { emoji: "⛰️", text: "在山顶上", category: "出行" },
    { emoji: "🛒", text: "在超市里", category: "生活" }
  ];

  var ACTIONS = [
    { emoji: "⚽", text: "踢足球", category: "运动" },
    { emoji: "🏀", text: "打篮球", category: "运动" },
    { emoji: "🎨", text: "画画", category: "艺术" },
    { emoji: "🎵", text: "唱歌", category: "艺术" },
    { emoji: "📖", text: "读书", category: "学习" },
    { emoji: "🧹", text: "打扫卫生", category: "生活" },
    { emoji: "🍳", text: "做早餐", category: "生活" },
    { emoji: "🚴‍♂️", text: "骑自行车", category: "运动" },
    { emoji: "🏊‍♂️", text: "游泳", category: "运动" },
    { emoji: "🧩", text: "拼拼图", category: "游戏" },
    { emoji: "🎮", text: "打游戏", category: "游戏" },
    { emoji: "📷", text: "拍照", category: "生活" },
    { emoji: "🛰️", text: "接收卫星信号", category: "科技" },
    { emoji: "🔍", text: "找线索", category: "游戏" }
  ];

  var EXTRAS = [
    { emoji: "🍎", text: "摘到了苹果", category: "美食" },
    { emoji: "🍜", text: "煮了一碗面", category: "美食" },
    { emoji: "🍦", text: "买到冰淇淋", category: "美食" },
    { emoji: "🎈", text: "拿着气球", category: "游玩" },
    { emoji: "🎁", text: "收到礼物", category: "生活" },
    { emoji: "🧸", text: "抱着玩具熊", category: "生活" },
    { emoji: "🚗", text: "坐上小汽车", category: "出行" },
    { emoji: "🚌", text: "赶上公交车", category: "出行" },
    { emoji: "🚀", text: "看见火箭起飞", category: "科技" },
    { emoji: "🛸", text: "发现飞碟", category: "想象" },
    { emoji: "🌧️", text: "突然下雨了", category: "天气" },
    { emoji: "❄️", text: "雪花飘下来", category: "天气" },
    { emoji: "🌞", text: "太阳很晒", category: "天气" },
    { emoji: "🌈", text: "出现彩虹", category: "天气" },
    { emoji: "🐝", text: "蜜蜂飞过来", category: "动物" },
    { emoji: "🦋", text: "蝴蝶绕圈飞", category: "动物" },
    { emoji: "🐢", text: "乌龟慢慢爬", category: "动物" },
    { emoji: "🐧", text: "企鹅摇摇摆摆", category: "动物" },
    { emoji: "🎪", text: "路过马戏团", category: "游玩" },
    { emoji: "🎭", text: "看到有趣表演", category: "艺术" },
    { emoji: "🧪", text: "做小实验", category: "学习" },
    { emoji: "🔢", text: "算出一道数学题", category: "学习" },
    { emoji: "⏰", text: "闹钟突然响了", category: "生活" },
    { emoji: "🔋", text: "捡到一节电池", category: "科技" }
  ];

  var FEELINGS = [
    { emoji: "😄", text: "开心极了", category: "情绪" },
    { emoji: "🤩", text: "兴奋得跳起来", category: "情绪" },
    { emoji: "😅", text: "有点不好意思", category: "情绪" },
    { emoji: "😴", text: "累得睡着了", category: "情绪" },
    { emoji: "🤔", text: "陷入了思考", category: "情绪" },
    { emoji: "😎", text: "觉得很酷", category: "情绪" },
    { emoji: "🥳", text: "庆祝起来", category: "情绪" },
    { emoji: "😮", text: "惊讶得张大嘴", category: "情绪" }
  ];

  function shuffle(items) {
    var result = items.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  function sampleWithoutRepeat(items, count, usedEmojis) {
    return shuffle(items).filter(function (item) {
      return !usedEmojis.has(item.emoji);
    }).slice(0, count);
  }

  function buildParts(level) {
    var used = new Set();
    var parts = [];

    if (level === 1) {
      return sampleWithoutRepeat(SINGLE_STORIES, 1, used);
    }

    var subject = sampleWithoutRepeat(SUBJECTS, 1, used)[0];
    used.add(subject.emoji);
    parts.push(subject);

    if (level >= 3) {
      var place = sampleWithoutRepeat(PLACES, 1, used)[0];
      used.add(place.emoji);
      parts.push(place);
    }

    var action = sampleWithoutRepeat(ACTIONS, 1, used)[0];
    used.add(action.emoji);
    parts.push(action);

    var fixedCount = parts.length;
    if (level >= 4) {
      fixedCount += 1;
    }
    var extras = sampleWithoutRepeat(EXTRAS, Math.max(0, level - fixedCount), used);
    extras.forEach(function (item) {
      used.add(item.emoji);
      parts.push(item);
    });

    if (level >= 4) {
      var feeling = sampleWithoutRepeat(FEELINGS, 1, used)[0];
      used.add(feeling.emoji);
      parts.push(feeling);
    }

    return parts;
  }

  function joinPhrase(parts) {
    if (parts.length === 1) {
      return parts[0].text;
    }

    var hasPlace = parts.length >= 3;
    var beginning = parts[0].text + (hasPlace ? parts[1].text : "") + (hasPlace ? parts[2].text : parts[1].text);
    var feeling = parts.length >= 4 ? parts[parts.length - 1].text : "";
    var extras = parts.length >= 4 ? parts.slice(3, parts.length - 1) : [];
    var pieces = [beginning].concat(extras.map(function (item) {
      return item.text;
    }));

    if (feeling) {
      pieces.push(feeling);
    }
    return pieces.join("，");
  }

  function makeDistractors(parts) {
    var allParts = SUBJECTS.concat(PLACES, ACTIONS, EXTRAS, FEELINGS);
    var correct = joinPhrase(parts);
    var texts = new Set();
    var seqs = new Set();
    var guard = 0;
    var mutationCount = Math.min(parts.length, 1 + Math.floor(Math.random() * Math.min(3, parts.length)));

    while (texts.size < 3 && guard < 300) {
      guard++;
      var replacedTexts = parts.map(function (item) {
        return item.text;
      });
      var replacedEmojis = parts.map(function (item) {
        return item.emoji;
      });
      var positions = shuffle(parts.map(function (_, index) {
        return index;
      })).slice(0, mutationCount);

      positions.forEach(function (position) {
        var replacement = allParts[Math.floor(Math.random() * allParts.length)];
        var tries = 0;
        /* 关键：替换项必须换掉 emoji（否则画面不变、意思雷同），且词段不能与句中其他部分重复 */
        while (tries < 60 &&
               (replacement.emoji === parts[position].emoji ||
                replacement.text === parts[position].text ||
                replacedTexts.indexOf(replacement.text) !== -1)) {
          replacement = allParts[Math.floor(Math.random() * allParts.length)];
          tries++;
        }
        replacedTexts[position] = replacement.text;
        replacedEmojis[position] = replacement.emoji;
      });

      /* 两个干扰项若对应同一 emoji 序列，意思必然雷同（如「企鹅」vs「企鹅摇摇摆摆」），只保留一个 */
      var seq = replacedEmojis.join("|");
      var candidate = joinPhrase(parts.map(function (item, index) {
        return { emoji: item.emoji, text: replacedTexts[index], category: item.category };
      }));

      if (candidate && candidate !== correct && !seqs.has(seq)) {
        texts.add(candidate);
        seqs.add(seq);
      }
    }

    return Array.from(texts);
  }

  function buildQuestion(level) {
    var parts = buildParts(level);
    var emojis = parts.map(function (item) {
      return item.emoji;
    });
    var correct = joinPhrase(parts);
    var ordered = shuffle([correct].concat(makeDistractors(parts)).slice(0, 4));

    return {
      emojis: emojis,
      options: ordered,
      answer: ordered.indexOf(correct),
      category: "第 " + level + " 关",
      explain: "逐个对应：" + parts.map(function (item) {
        return item.emoji + " " + item.text;
      }).join("；")
    };
  }

  function buildLevelQuestions(level) {
    level = Number(level);
    if (!Number.isInteger(level) || level < 1 || level > LEVEL_COUNT) {
      throw new Error("关卡必须在 1 到 " + LEVEL_COUNT + " 之间");
    }

    var questions = [];
    var signatures = new Set();
    var guard = 0;

    while (questions.length < QUESTIONS_PER_LEVEL && guard < 300) {
      guard++;
      var question = buildQuestion(level);
      var signature = question.emojis.join("|");
      if (!signatures.has(signature)) {
        signatures.add(signature);
        questions.push(question);
      }
    }

    while (questions.length < QUESTIONS_PER_LEVEL) {
      questions.push(buildQuestion(level));
    }

    return shuffle(questions);
  }

  return {
    LEVEL_COUNT: LEVEL_COUNT,
    QUESTIONS_PER_LEVEL: QUESTIONS_PER_LEVEL,
    buildLevelQuestions: buildLevelQuestions
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = EmojiQuestionBank;
}
