#!/usr/bin/env python3
"""General, lesson-independent question generators for 抓人游戏.

题库不依赖某本教材里的具体课文。语文题只考查通用词语、成语、修辞和句式；
英语题只考查常见词义与基础语法；数学题全部由参数生成并校验答案。
"""

import random
import time
from collections import Counter


_seen = set()


def reset_seen():
    _seen.clear()


def _qid(value):
    return f"q{int(time.time() * 1000)}-{value}-{random.randrange(10 ** 8)}"


def _mc(text, correct, wrong, category):
    correct = str(correct)
    choices = []
    for value in [correct, *wrong]:
        value = str(value)
        if value not in choices:
            choices.append(value)
    fallback = 0
    while len(choices) < 4:
        fallback += 1
        filler = f"以上都不对（{fallback}）"
        if filler not in choices:
            choices.append(filler)
    choices = choices[:4]
    random.shuffle(choices)
    if len(set(choices)) != 4 or correct not in choices:
        raise ValueError(f"bad choices: {text!r}, {choices!r}")
    return {"text": text, "choices": choices, "answer": correct, "category": category}


def _int_mc(text, correct, spread=5, minimum=0):
    correct = int(correct)
    candidates = []
    delta = 1
    while len(candidates) < 12:
        for value in (correct - delta, correct + delta):
            if value >= minimum and value not in candidates:
                candidates.append(value)
        delta += 1
    wrong = random.sample(candidates, 3)
    return _mc(text, correct, wrong, "math")


def _fraction_mc(text, numerator, denominator):
    correct = f"{numerator}/{denominator}"
    wrongs = []
    while len(wrongs) < 3:
        delta_n = random.choice([-3, -2, -1, 1, 2, 3])
        delta_d = random.choice([-2, -1, 1, 2])
        n, d = numerator + delta_n, denominator + delta_d
        if n > 0 and d > 1 and n != numerator and f"{n}/{d}" not in wrongs:
            wrongs.append(f"{n}/{d}")
    return _mc(text, correct, wrongs, "math")


# ---------------- 数学 ----------------

def math_grade(grade):
    """Generate a general math question for grade 1-6."""
    if grade == 1:
        kind = random.choice(["add", "sub", "missing", "count", "compare"])
        if kind == "add":
            a, b = random.randint(1, 10), random.randint(1, 10)
            return _int_mc(f"{a} + {b} = ?", a + b, 4)
        if kind == "sub":
            a = random.randint(5, 18)
            b = random.randint(1, a - 1)
            return _int_mc(f"{a} - {b} = ?", a - b, 4)
        if kind == "missing":
            a, b = random.randint(1, 9), random.randint(1, 9)
            return _int_mc(f"{a} + ? = {a + b}", b, 4)
        if kind == "count":
            start, step = random.randint(1, 8), random.choice([1, 2, 5])
            seq = [start + step * i for i in range(4)]
            return _int_mc(f"{', '.join(map(str, seq))}，下一个数是多少？", seq[-1] + step, 4)
        a, b = random.randint(1, 20), random.randint(1, 20)
        return _mc("哪个数更大？", max(a, b), [min(a, b), max(1, max(a, b) - 1), min(20, min(a, b) + 1)], "math")

    if grade == 2:
        kind = random.choice(["add", "sub", "mul", "divide", "group"])
        if kind == "add":
            a, b = random.randint(15, 78), random.randint(11, 59)
            return _int_mc(f"{a} + {b} = ?", a + b, 8)
        if kind == "sub":
            a, b = random.randint(45, 98), random.randint(12, 39)
            return _int_mc(f"{a} - {b} = ?", a - b, 8)
        if kind == "mul":
            a, b = random.randint(2, 9), random.randint(2, 9)
            return _int_mc(f"{a} × {b} = ?", a * b, 7)
        if kind == "divide":
            b, q = random.randint(2, 9), random.randint(3, 9)
            return _int_mc(f"{b * q} ÷ {b} = ?", q, 5)
        boxes, each = random.randint(3, 9), random.randint(3, 9)
        return _int_mc(f"{boxes}个盒子，每盒{each}个苹果，一共有多少个苹果？", boxes * each, 8)

    if grade == 3:
        kind = random.choice(["mul", "div", "perimeter", "area", "fraction", "unit"])
        if kind == "mul":
            a, b = random.randint(12, 48), random.randint(3, 9)
            return _int_mc(f"{a} × {b} = ?", a * b, 14)
        if kind == "div":
            b, q = random.randint(3, 9), random.randint(8, 18)
            return _int_mc(f"{b * q} ÷ {b} = ?", q, 7)
        if kind == "perimeter":
            a, b = random.randint(8, 35), random.randint(6, 28)
            return _int_mc(f"长方形长{a}厘米、宽{b}厘米，周长是多少厘米？", 2 * (a + b), 12)
        if kind == "area":
            a, b = random.randint(4, 18), random.randint(3, 14)
            return _int_mc(f"长方形长{a}厘米、宽{b}厘米，面积是多少平方厘米？", a * b, 12)
        if kind == "fraction":
            a = random.randint(1, 5)
            return _fraction_mc(f"{a}/7 + 2/7 = ?", a + 2, 7)
        big = random.randint(2, 9)
        return _int_mc(f"{big}米 = ?厘米", big * 100, 100)

    if grade == 4:
        kind = random.choice(["add", "sub", "factor", "average", "decimal", "angle"])
        if kind == "add":
            a, b = random.randint(145, 890), random.randint(120, 760)
            return _int_mc(f"{a} + {b} = ?", a + b, 30)
        if kind == "sub":
            a, b = random.randint(420, 985), random.randint(125, 385)
            return _int_mc(f"{a} - {b} = ?", a - b, 25)
        if kind == "factor":
            n = random.choice([24, 30, 36, 42, 48, 56, 60, 72])
            factor = random.choice([d for d in range(2, n) if n % d == 0])
            wrong = [x for x in range(2, min(30, n)) if n % x != 0]
            return _mc(f"下列哪个数是 {n} 的因数？", factor, random.sample(wrong, 3), "math")
        if kind == "average":
            count = random.randint(4, 7)
            avg = random.randint(12, 45)
            nums = [avg + random.randint(-6, 6) for _ in range(count - 1)]
            nums.append(count * avg - sum(nums))
            return _int_mc(f"{', '.join(map(str, nums))} 的平均数是多少？", avg, 6)
        if kind == "decimal":
            whole, tenth = random.randint(2, 18), random.randint(1, 9)
            value = whole + tenth / 10
            wrong = [f"{whole + random.randint(1,3)}.{random.randint(0,9)}" for _ in range(3)]
            return _mc(f"{whole}.{tenth} + 1.5 = ?", f"{value + 1.5:.1f}", wrong, "math")
        angle = random.choice([35, 48, 72, 90, 105, 132, 160])
        if angle < 90:
            correct, wrong = "锐角", ["直角", "钝角", "平角"]
        elif angle == 90:
            correct, wrong = "直角", ["锐角", "钝角", "平角"]
        else:
            correct, wrong = "钝角", ["锐角", "直角", "平角"]
        return _mc(f"{angle}°的角是什么角？", correct, wrong, "math")

    if grade == 5:
        kind = random.choice(["decimal", "fraction", "volume", "percent", "equation", "average"])
        if kind == "decimal":
            a = random.randint(15, 88) / 10
            b = random.randint(12, 74) / 10
            wrong = [f"{a + b + x:.1f}" for x in random.sample([0.2, 0.5, 1, -0.3], 3)]
            return _mc(f"{a:.1f} + {b:.1f} = ?", f"{a + b:.1f}", wrong, "math")
        if kind == "fraction":
            a = random.randint(1, 6)
            return _fraction_mc(f"{a}/9 + 4/9 = ?", a + 4, 9)
        if kind == "volume":
            a, b, c = random.randint(3, 12), random.randint(4, 14), random.randint(2, 9)
            return _int_mc(f"长方体长{a}厘米、宽{b}厘米、高{c}厘米，体积是多少立方厘米？", a * b * c, 20)
        if kind == "percent":
            base = random.choice([20, 40, 60, 80, 120, 200])
            pct = random.choice([10, 20, 25, 50, 75])
            return _int_mc(f"{base} 的 {pct}% 是多少？", base * pct // 100, 8)
        if kind == "equation":
            x, b = random.randint(4, 24), random.randint(6, 28)
            return _int_mc(f"x + {b} = {x + b}，x = ?", x, 7)
        count, avg = random.randint(5, 8), random.randint(18, 52)
        nums = [avg + random.randint(-8, 8) for _ in range(count - 1)]
        nums.append(count * avg - sum(nums))
        return _int_mc(f"{count}个数的平均数是{avg}，已知其中{count - 1}个数是{', '.join(map(str, nums[:count - 1]))}，另一个数是多少？", nums[-1], 8)

    kind = random.choice(["percent", "ratio", "negative", "equation", "fraction", "proportion"])
    if kind == "percent":
        base = random.choice([25, 40, 50, 60, 80, 150, 200])
        pct = random.choice([4, 8, 12, 15, 20, 25, 40, 60])
        correct = base * pct // 100 if base * pct % 100 == 0 else base * pct / 100
        if isinstance(correct, int):
            return _int_mc(f"{base} 的 {pct}% 是多少？", correct, 10)
        wrong = [f"{correct + x:.2f}" for x in random.sample([0.2, 0.5, 1, -0.3], 3)]
        return _mc(f"{base} 的 {pct}% 是多少？", f"{correct:.2f}", wrong, "math")
    if kind == "ratio":
        a, b = random.randint(2, 9), random.randint(2, 9)
        multiple = random.randint(3, 9)
        total = (a + b) * multiple
        return _int_mc(f"两项的比是 {a}:{b}，总数是 {total}，较大一项是多少？", max(a, b) * multiple, 12)
    if kind == "negative":
        a = random.randint(8, 28)
        b = random.randint(8, 28)
        return _int_mc(f"(-{a}) + {b} = ?", b - a, 8)
    if kind == "equation":
        x, a, b = random.randint(3, 18), random.randint(2, 9), random.randint(4, 20)
        return _int_mc(f"{a}x + {b} = {a * x + b}，x = ?", x, 7)
    if kind == "fraction":
        denominator = random.choice([6, 8, 9, 10, 12])
        a = random.randint(1, denominator - 4)
        return _fraction_mc(f"{a}/{denominator} + {denominator - a - 1}/{denominator} = ?", denominator - 1, denominator)
    a, b = random.randint(2, 8), random.randint(2, 9)
    multiple = random.randint(4, 12)
    return _int_mc(f"若 3 个同样的本子价钱是 {3 * multiple} 元，{a} 个同样的本子是多少元？", a * multiple, 10)


# ---------------- 语文 ----------------

CHINESE_ANTONYMS = {
    1: [("大", "小"), ("上", "下"), ("多", "少"), ("长", "短"), ("高", "矮"), ("快", "慢"), ("开", "关"), ("来", "去"), ("白", "黑"), ("远", "近"), ("左", "右"), ("前", "后"), ("冷", "热"), ("哭", "笑"), ("买", "卖"), ("早", "晚"), ("新", "旧"), ("借", "还"), ("对", "错"), ("有", "无"), ("生", "熟"), ("粗", "细"), ("厚", "薄"), ("重", "轻")],
    2: [("开始", "结束"), ("安全", "危险"), ("美丽", "丑陋"), ("高兴", "难过"), ("安静", "吵闹"), ("勤劳", "懒惰"), ("诚实", "虚伪"), ("温暖", "寒冷"), ("明亮", "黑暗"), ("整齐", "凌乱"), ("勇敢", "胆小"), ("认真", "马虎"), ("成功", "失败"), ("进步", "退步"), ("消失", "出现"), ("保护", "破坏"), ("聚集", "分散"), ("熟悉", "陌生"), ("容易", "困难"), ("节约", "浪费"), ("详细", "简单"), ("坚硬", "柔软"), ("潮湿", "干燥"), ("表扬", "批评")],
    3: [("反对", "赞成"), ("精致", "粗糙"), ("沉着", "慌张"), ("严肃", "活泼"), ("宽阔", "狭窄"), ("坚固", "脆弱"), ("谦让", "争抢"), ("热闹", "冷清"), ("灵活", "笨拙"), ("鲜艳", "黯淡"), ("丰富", "贫乏"), ("幸运", "倒霉"), ("清楚", "模糊"), ("迅速", "缓慢"), ("善良", "恶毒"), ("团结", "分裂"), ("遵守", "违反"), ("表现", "隐藏"), ("临时", "长期"), ("普通", "特别"), ("节省", "浪费"), ("平静", "激动"), ("肯定", "怀疑"), ("衰退", "兴盛")],
    4: [("宽阔", "狭窄"), ("独特", "普通"), ("继续", "停止"), ("确定", "猜测"), ("纯洁", "污浊"), ("慷慨", "吝啬"), ("尊重", "轻视"), ("沉默", "喧哗"), ("陌生", "熟悉"), ("谨慎", "鲁莽"), ("坚强", "软弱"), ("乐观", "悲观"), ("公正", "偏心"), ("清晰", "含糊"), ("舒适", "难受"), ("支持", "反对"), ("完整", "残缺"), ("丰富", "单调"), ("冷静", "冲动"), ("真诚", "虚假"), ("高尚", "卑劣"), ("繁荣", "萧条"), ("宽容", "计较"), ("积极", "消极")],
    5: [("简洁", "烦琐"), ("隐秘", "公开"), ("稚拙", "成熟"), ("慷慨", "自私"), ("纯熟", "生疏"), ("僻静", "热闹"), ("郑重", "随便"), ("刚毅", "柔弱"), ("明朗", "阴暗"), ("精密", "粗略"), ("厚重", "轻薄"), ("深邃", "浅显"), ("克制", "放纵"), ("珍视", "轻视"), ("沉着", "急躁"), ("忠诚", "背叛"), ("干涸", "湿润"), ("严肃", "轻浮"), ("坚劲", "松散"), ("勤勉", "懒散"), ("浑浊", "清澈"), ("慷慨", "小气"), ("独特", "雷同"), ("断然", "犹豫")],
    6: [("豁达", "狭隘"), ("凝重", "轻快"), ("粗犷", "细腻"), ("萎缩", "茂盛"), ("深邃", "肤浅"), ("郑重", "轻率"), ("慷慨", "吝啬"), ("澄澈", "浑浊"), ("幽静", "喧闹"), ("坚毅", "动摇"), ("简陋", "精致"), ("高洁", "卑劣"), ("纯粹", "混杂"), ("敬畏", "轻慢"), ("蓬勃", "衰败"), ("敦厚", "狡诈"), ("庄重", "随便"), ("清幽", "嘈杂"), ("坚韧", "脆弱"), ("从容", "慌乱"), ("严峻", "温和"), ("独特", "平常"), ("娴熟", "生疏"), ("真挚", "虚伪")],
}

CHINESE_SYNONYMS = {
    1: [("帮忙", "帮助"), ("开心", "快乐"), ("美丽", "漂亮"), ("立刻", "马上"), ("许多", "很多"), ("常常", "经常"), ("伙伴", "朋友"), ("明亮", "光亮"), ("温暖", "暖和"), ("观看", "看"), ("聆听", "听"), ("忽然", "突然"), ("非常", "特别"), ("著名", "有名"), ("高兴", "愉快"), ("称赞", "夸奖"), ("保护", "爱护"), ("告别", "道别"), ("小心", "谨慎"), ("询问", "问"), ("通知", "告诉"), ("整齐", "整洁"), ("着急", "焦急"), ("礼物", "礼品")],
    2: [("有名", "著名"), ("马上", "立刻"), ("美丽", "秀丽"), ("帮助", "援助"), ("安静", "宁静"), ("特别", "特殊"), ("尊敬", "尊重"), ("快活", "快乐"), ("渐渐", "逐渐"), ("平时", "平常"), ("高兴", "喜悦"), ("奇怪", "奇异"), ("到底", "究竟"), ("著名", "闻名"), ("细心", "仔细"), ("激动", "兴奋"), ("希望", "期望"), ("疼爱", "喜爱"), ("宽阔", "宽广"), ("温暖", "暖和"), ("突然", "忽然"), ("专心", "认真"), ("惋惜", "可惜"), ("关心", "关怀")],
    3: [("珍贵", "宝贵"), ("询问", "打听"), ("迅速", "快速"), ("安静", "寂静"), ("坚固", "牢固"), ("详细", "仔细"), ("鼓励", "激励"), ("欣赏", "观赏"), ("惟妙惟肖", "栩栩如生"), ("清楚", "清晰"), ("宽阔", "广阔"), ("立即", "立刻"), ("居然", "竟然"), ("奥秘", "奥妙"), ("特殊", "特别"), ("爱护", "爱惜"), ("沉静", "冷静"), ("照料", "照顾"), ("希望", "盼望"), ("尽量", "尽力"), ("诚恳", "诚挚"), ("持续", "延续"), ("解决", "处理"), ("调皮", "顽皮")],
    4: [("敬佩", "佩服"), ("熟练", "娴熟"), ("宽阔", "辽阔"), ("沉静", "安静"), ("慎重", "谨慎"), ("维持", "保持"), ("抱歉", "歉疚"), ("清楚", "明晰"), ("确切", "准确"), ("阻止", "禁止"), ("照顾", "照料"), ("踌躇", "犹豫"), ("惊异", "惊讶"), ("坚强", "顽强"), ("成果", "成绩"), ("连续", "陆续"), ("兴致勃勃", "兴味盎然"), ("凝视", "注视"), ("珍惜", "爱惜"), ("郑重", "慎重"), ("期待", "盼望"), ("诚恳", "真诚"), ("便宜", "低廉"), ("风格", "特色")],
    5: [("慎重", "谨慎"), ("分明", "明显"), ("慷慨", "大方"), ("普通", "平常"), ("清脆", "响亮"), ("凝望", "注视"), ("熟悉", "熟识"), ("坚固", "牢固"), ("尊重", "敬重"), ("焦灼", "焦急"), ("敏锐", "敏捷"), ("纯熟", "熟练"), ("僻静", "偏僻"), ("严肃", "庄重"), ("幽静", "清幽"), ("粗犷", "豪放"), ("惬意", "舒服"), ("启迪", "启发"), ("珍贵", "宝贵"), ("含糊", "模糊"), ("温顺", "温和"), ("干涸", "干枯"), ("承担", "担负"), ("界限", "边界")],
    6: [("刚毅", "坚毅"), ("郑重", "慎重"), ("静谧", "安静"), ("深邃", "深远"), ("娴熟", "熟练"), ("慷慨", "大方"), ("精巧", "精致"), ("凝重", "庄重"), ("浑浊", "污浊"), ("乐观", "豁达"), ("清幽", "清静"), ("包容", "宽容"), ("蕴藏", "包含"), ("独特", "特别"), ("神秘", "奥妙"), ("珍惜", "珍视"), ("执着", "坚持"), ("俭朴", "节约"), ("崇高", "高尚"), ("忽然", "突然"), ("恰当", "妥当"), ("坚韧", "顽强"), ("关切", "关心"), ("黯然", "沮丧")],
}

CHINESE_IDIOMS = {
    1: [("一目了然", "一眼就能看清楚"), ("不计其数", "数量非常多"), ("欢天喜地", "非常高兴"), ("全心全意", "一心一意"), ("必不可少", "一定要有"), ("自言自语", "自己和自己说话"), ("千军万马", "人马很多"), ("三五成群", "人们组成小群"), ("四面八方", "各个方向"), ("百发百中", "每次都命中")],
    2: [("井底之蛙", "眼界狭窄的人"), ("亡羊补牢", "出了问题后及时补救"), ("画蛇添足", "做多余的事"), ("守株待兔", "不主动努力，妄想意外收获"), ("掩耳盗铃", "自己欺骗自己"), ("杯水车薪", "力量太小，解决不了问题"), ("名不虚传", "确实很好，不是空有名声"), ("小心翼翼", "非常小心"), ("博览群书", "广泛阅读许多书"), ("水到渠成", "条件成熟，事情自然成功")],
    3: [("画龙点睛", "在关键处加上精辟语句"), ("望梅止渴", "用空想安慰自己"), ("胸有成竹", "做事之前已有主意"), ("雪中送炭", "在别人急需时给予帮助"), ("锦上添花", "好上加好"), ("滥竽充数", "没本领的人混在行家中"), ("孤注一掷", "危急时用尽全部力量冒险"), ("从容不迫", "非常镇静"), ("惊弓之鸟", "受过惊吓后特别害怕"), ("居高临下", "处在高处俯视低处")],
    4: [("实事求是", "按照实际情况办事"), ("一丝不苟", "做事认真细致"), ("举世闻名", "全世界都有名"), ("层出不穷", "不断出现"), ("名副其实", "名声与实际相符"), ("目不转睛", "看得很专注"), ("宁静致远", "心境安静才能达到远大目标"), ("水滴石穿", "坚持就能成功"), ("循序渐进", "按照步骤逐渐深入"), ("不可思议", "难以想象和理解")],
    5: [("名副其实", "名声符合实际"), ("叹为观止", "赞美事物好到极点"), ("别具匠心", "有独特的巧妙构思"), ("豁然开朗", "忽然明白或开阔"), ("触景生情", "看到景物产生感情"), ("引人入胜", "景物或作品很吸引人"), ("妙笔生花", "写作才能杰出"), ("循序渐进", "按步骤逐渐提高"), ("百炼成钢", "经过锻炼变得坚强"), ("安贫乐道", "安于贫困，坚守信念")],
    6: [("高瞻远瞩", "眼光远大"), ("融会贯通", "把知识融合并全面理解"), ("坚持不懈", "坚持而不放弃"), ("实事求是", "依据实际情况探求真理"), ("深思熟虑", "深入细致地考虑"), ("见微知著", "从细节推知全貌"), ("举一反三", "由此及彼灵活运用"), ("锲而不舍", "坚持不懈"), ("集思广益", "集中众人智慧"), ("抑扬顿挫", "声音高低起伏悦耳")],
}

CHINESE_MEASURE = [
    ("一匹马", "匹"), ("一头牛", "头"), ("一本书", "本"), ("一把刀", "把"), ("一条河", "条"), ("一朵花", "朵"), ("一只鸟", "只"), ("一张纸", "张"), ("一棵树", "棵"), ("一块面包", "块"), ("一件衣服", "件"), ("一双鞋", "双"), ("一台电脑", "台"), ("一辆汽车", "辆"), ("一座山", "座"), ("一幅画", "幅"), ("一封信", "封"), ("一首诗", "首"), ("一盏灯", "盏"), ("一顿饭", "顿")
]


def chinese_grade(grade):
    modes = ["antonym", "synonym", "idiom", "measure", "rhetoric", "wordtype"]
    mode = random.choice(modes)
    if mode == "antonym":
        pairs = CHINESE_ANTONYMS[grade]
        first, answer = random.choice(pairs)
        wrong = random.sample([b for _, b in pairs if b != answer], 3)
        return _mc(f"“{first}”的反义词是什么？", answer, wrong, "chinese")
    if mode == "synonym":
        pairs = [x for x in CHINESE_SYNONYMS[grade] if len(x) == 2 and x[1]]
        first, answer = random.choice(pairs)
        wrong = random.sample([b for _, b in pairs if b != answer], 3)
        return _mc(f"“{first}”的近义词是什么？", answer, wrong, "chinese")
    if mode == "idiom":
        text, answer = random.choice(CHINESE_IDIOMS[grade])
        all_answers = [answer for t, answer in CHINESE_IDIOMS[grade] if answer != answer or t != text]
        wrong = random.sample(all_answers, 3)
        return _mc(f"“{text}”的意思是什么？", answer, wrong, "chinese")
    if mode == "measure":
        phrase, answer = random.choice(CHINESE_MEASURE)
        wrong = random.sample([m for _, m in CHINESE_MEASURE if m != answer], 3)
        return _mc(f"“{phrase}”中的量词是什么？", answer, wrong, "chinese")
    if mode == "rhetoric":
        subjects = ["太阳", "月亮", "星星", "湖水", "落叶", "时间", "书本", "雪花", "春风", "灯光"]
        objects = ["大火球", "小船", "眼睛", "镜子", "蝴蝶", "流水", "老师", "棉花", "母亲的手", "长河"]
        subject, object_word = random.sample(subjects, 2)[0], random.choice(objects)
        sentence = f"“{subject}像{object_word}”用了什么修辞手法？"
        return _mc(sentence, "比喻", ["拟人", "夸张", "排比"], "chinese")
    word_groups = {
        1: [("苹果", "名词"), ("跑", "动词"), ("红色", "名词"), ("跳", "动词"), ("美丽", "形容词"), ("小鸟", "名词"), ("高", "形容词"), ("说", "动词")],
        2: [("诚实", "形容词"), ("思考", "动词"), ("教室", "名词"), ("慢慢", "形容词"), ("游泳", "动词"), ("彩虹", "名词"), ("认真", "形容词"), ("帮助", "动词")],
        3: [("智慧", "名词"), ("观察", "动词"), ("勇敢", "形容词"), ("宁静", "形容词"), ("研究", "动词"), ("理想", "名词"), ("迅速", "形容词"), ("讨论", "动词")],
        4: [("耐心", "名词"), ("推测", "动词"), ("独特", "形容词"), ("和谐", "形容词"), ("探索", "动词"), ("尊严", "名词"), ("敏捷", "形容词"), ("鼓舞", "动词")],
        5: [("意境", "名词"), ("揣摩", "动词"), ("慷慨", "形容词"), ("幽静", "形容词"), ("启迪", "动词"), ("境界", "名词"), ("纯熟", "形容词"), ("滋润", "动词")],
        6: [("哲理", "名词"), ("领悟", "动词"), ("深邃", "形容词"), ("豁达", "形容词"), ("诠释", "动词"), ("憧憬", "名词"), ("坚韧", "形容词"), ("凝聚", "动词")],
    }
    word, answer = random.choice(word_groups[grade])
    wrong = sorted(set(["名词", "动词", "形容词", "副词"]) - {answer})[:3]
    return _mc(f"“{word}”通常是什么词？", answer, wrong, "chinese")


# ---------------- 英语 ----------------

ENGLISH_WORDS = {
    1: [("apple", "苹果"), ("banana", "香蕉"), ("cat", "猫"), ("dog", "狗"), ("bird", "鸟"), ("fish", "鱼"), ("book", "书"), ("pen", "钢笔"), ("bag", "书包"), ("desk", "课桌"), ("red", "红色"), ("blue", "蓝色"), ("green", "绿色"), ("yellow", "黄色"), ("black", "黑色"), ("mother", "妈妈"), ("father", "爸爸"), ("sister", "姐妹"), ("brother", "兄弟"), ("teacher", "老师"), ("student", "学生"), ("school", "学校"), ("home", "家"), ("milk", "牛奶"), ("rice", "米饭"), ("egg", "鸡蛋"), ("big", "大的"), ("small", "小的"), ("tall", "高的"), ("happy", "高兴的"), ("sad", "伤心的"), ("run", "跑"), ("jump", "跳"), ("read", "读"), ("write", "写"), ("sing", "唱歌"), ("eat", "吃"), ("drink", "喝"), ("open", "打开"), ("close", "关闭"), ("morning", "早晨"), ("night", "夜晚"), ("sun", "太阳"), ("moon", "月亮"), ("rain", "雨"), ("wind", "风"), ("tree", "树"), ("flower", "花"), ("car", "汽车"), ("bus", "公共汽车")],
    2: [("spring", "春天"), ("summer", "夏天"), ("autumn", "秋天"), ("winter", "冬天"), ("Monday", "星期一"), ("Tuesday", "星期二"), ("Friday", "星期五"), ("Sunday", "星期日"), ("January", "一月"), ("March", "三月"), ("July", "七月"), ("September", "九月"), ("breakfast", "早餐"), ("lunch", "午餐"), ("dinner", "晚餐"), ("bedroom", "卧室"), ("kitchen", "厨房"), ("garden", "花园"), ("hospital", "医院"), ("park", "公园"), ("nurse", "护士"), ("doctor", "医生"), ("driver", "司机"), ("farmer", "农民"), ("policeman", "男警察"), ("worker", "工人"), ("cloudy", "多云的"), ("sunny", "晴朗的"), ("windy", "有风的"), ("rainy", "下雨的"), ("cold", "寒冷的"), ("hot", "热的"), ("warm", "温暖的"), ("cool", "凉爽的"), ("new", "新的"), ("old", "旧的"), ("early", "早的"), ("late", "晚的"), ("listen", "听"), ("speak", "说"), ("sleep", "睡觉"), ("wash", "洗"), ("clean", "打扫"), ("play", "玩"), ("study", "学习"), ("swim", "游泳"), ("dance", "跳舞"), ("draw", "画画"), ("count", "数数")],
    3: [("weather", "天气"), ("season", "季节"), ("library", "图书馆"), ("museum", "博物馆"), ("cinema", "电影院"), ("station", "车站"), ("airport", "机场"), ("beach", "海滩"), ("forest", "森林"), ("river", "河流"), ("mountain", "山"), ("island", "岛屿"), ("travel", "旅行"), ("arrive", "到达"), ("leave", "离开"), ("visit", "参观"), ("invite", "邀请"), ("answer", "回答"), ("question", "问题"), ("favorite", "最喜欢的"), ("delicious", "美味的"), ("expensive", "昂贵的"), ("cheap", "便宜的"), ("quiet", "安静的"), ("noisy", "吵闹的"), ("healthy", "健康的"), ("dangerous", "危险的"), ("safe", "安全的"), ("future", "未来"), ("past", "过去"), ("present", "现在"), ("holiday", "假期"), ("birthday", "生日"), ("festival", "节日"), ("family", "家庭"), ("parent", "父母"), ("cousin", "表亲"), ("neighbor", "邻居"), ("vegetable", "蔬菜"), ("fruit", "水果"), ("break", "休息"), ("choose", "选择"), ("describe", "描述"), ("practice", "练习"), ("remember", "记住"), ("forget", "忘记"), ("borrow", "借入"), ("lend", "借出"), ("prepare", "准备"), ("surprise", "惊喜")],
    4: [("knowledge", "知识"), ("message", "消息"), ("information", "信息"), ("suggestion", "建议"), ("decision", "决定"), ("description", "描述"), ("experience", "经验"), ("difficulty", "困难"), ("success", "成功"), ("failure", "失败"), ("progress", "进步"), ("purpose", "目的"), ("resource", "资源"), ("culture", "文化"), ("nature", "自然"), ("society", "社会"), ("technology", "技术"), ("device", "设备"), ("machine", "机器"), ("medicine", "药"), ("exercise", "锻炼"), ("competition", "比赛"), ("performance", "表演"), ("expression", "表达"), ("pronunciation", "发音"), ("grammar", "语法"), ("passenger", "乘客"), ("engineer", "工程师"), ("scientist", "科学家"), ("artist", "艺术家"), ("improve", "改进"), ("support", "支持"), ("protect", "保护"), ("suggest", "建议"), ("explain", "解释"), ("describe", "描写"), ("collect", "收集"), ("compare", "比较"), ("appear", "出现"), ("disappear", "消失"), ("reduce", "减少"), ("increase", "增加"), ("receive", "收到"), ("accept", "接受"), ("refuse", "拒绝"), ("familiar", "熟悉的"), ("excellent", "优秀的"), ("necessary", "必要的"), ("possible", "可能的"), ("careless", "粗心的")],
    5: [("achievement", "成就"), ("environment", "环境"), ("situation", "情况"), ("advantage", "优点"), ("disadvantage", "缺点"), ("opportunity", "机会"), ("challenge", "挑战"), ("confidence", "信心"), ("courage", "勇气"), ("patience", "耐心"), ("dependence", "依赖"), ("independence", "独立"), ("relationship", "关系"), ("responsibility", "责任"), ("tradition", "传统"), ("ceremony", "仪式"), ("equipment", "设备"), ("material", "材料"), ("condition", "条件"), ("attitude", "态度"), ("behavior", "行为"), ("benefit", "好处"), ("demand", "需求"), ("attention", "注意"), ("effect", "影响"), ("effort", "努力"), ("talent", "才能"), ("wisdom", "智慧"), ("achieve", "实现"), ("appreciate", "感激"), ("consider", "考虑"), ("continue", "继续"), ("develop", "发展"), ("encourage", "鼓励"), ("influence", "影响"), ("organize", "组织"), ("realize", "意识到"), ("recognize", "认出"), ("replace", "代替"), ("separate", "分开"), ("settle", "解决"), ("avoid", "避免"), ("available", "可获得的"), ("ancient", "古代的"), ("modern", "现代的"), ("common", "常见的"), ("regular", "规律的"), ("curious", "好奇的"), ("generous", "慷慨的"), ("reliable", "可靠的"), ("independent", "独立的")],
    6: [("ambition", "抱负"), ("consequence", "结果"), ("controversy", "争议"), ("democracy", "民主"), ("diversity", "多样性"), ("economy", "经济"), ("education", "教育"), ("freedom", "自由"), ("government", "政府"), ("history", "历史"), ("identity", "身份"), ("justice", "正义"), ("language", "语言"), ("literature", "文学"), ("media", "媒体"), ("memory", "记忆"), ("philosophy", "哲学"), ("policy", "政策"), ("population", "人口"), ("poverty", "贫困"), ("quality", "质量"), ("quantity", "数量"), ("resource", "资源"), ("science", "科学"), ("strategy", "策略"), ("technology", "科技"), ("truth", "真相"), ("universe", "宇宙"), ("academy", "学院"), ("community", "社区"), ("analyze", "分析"), ("argue", "论证"), ("conclude", "总结"), ("contribute", "贡献"), ("distribute", "分配"), ("emphasize", "强调"), ("evaluate", "评估"), ("investigate", "调查"), ("observe", "观察"), ("participate", "参加"), ("preserve", "保存"), ("promote", "促进"), ("reflect", "反映"), ("represent", "代表"), ("transform", "转变"), ("abstract", "抽象的"), ("accurate", "精确的"), ("appropriate", "恰当的"), ("complex", "复杂的"), ("fundamental", "基本的"), ("significant", "重要的")],
}


def english_grade(grade):
    modes = ["word", "reverse", "grammar", "plural", "pronoun"]
    if grade <= 2:
        mode = random.choice(["word", "reverse"])
    else:
        mode = random.choice(modes)
    words = ENGLISH_WORDS[grade]
    if mode == "word":
        word, chinese = random.choice(words)
        wrong = random.sample([c for _, c in words if c != chinese], 3)
        return _mc(f"“{word}”的中文意思是什么？", chinese, wrong, "english")
    if mode == "reverse":
        word, chinese = random.choice(words)
        wrong = random.sample([w for w, c in words if w != word], 3)
        return _mc(f"“{chinese}”的英文是什么？", word, wrong, "english")
    if mode == "grammar":
        subject, be = random.choice([("I", "am"), ("She", "is"), ("He", "is"), ("It", "is"), ("You", "are"), ("We", "are"), ("They", "are")])
        wrong = [option for option in ["am", "is", "are"] if option != be]
        return _mc(f"{subject} ____ a student.", be, wrong, "english")
    if mode == "plural":
        pairs = [("child", "children"), ("foot", "feet"), ("tooth", "teeth"), ("man", "men"), ("woman", "women"), ("box", "boxes"), ("bus", "buses"), ("city", "cities"), ("baby", "babies"), ("leaf", "leaves"), ("knife", "knives"), ("book", "books"), ("dog", "dogs"), ("photo", "photos"), ("piano", "pianos")]
        singular, answer = random.choice(pairs)
        wrong = random.sample([p for _, p in pairs if p != answer], 3)
        return _mc(f"Choose the plural form: {singular}", answer, wrong, "english")
    pronouns = [
        ("myself", "I"), ("yourself", "you"), ("himself", "he"), ("herself", "she"), ("itself", "it"),
        ("ourselves", "we"), ("themselves", "they")
    ]
    answer, subject = random.choice(pronouns)
    wrong = random.sample([p for p, _ in pronouns if p != answer], 3)
    return _mc(f"Choose the correct reflexive pronoun for “{subject}”.", answer, wrong, "english")


# ---------------- 竞赛题 ----------------

def competition(value):
    if value == 9:
        kind = random.choice(["sequence", "sum", "remainder", "pattern", "count"])
        if kind == "sequence":
            a, b = random.randint(1, 8), random.randint(2, 9)
            seq = [a, b]
            for _ in range(4):
                seq.append(seq[-1] + seq[-2])
            return _int_mc(f"数列 {seq[0]}，{seq[1]}，{seq[2]}，{seq[3]}，{seq[4]} 的下一项是多少？", seq[5], 12)
        if kind == "sum":
            n = random.randint(16, 42)
            return _int_mc(f"1 + 2 + 3 + … + {n} = ?", n * (n + 1) // 2, 18)
        if kind == "remainder":
            n = random.randint(90, 260)
            divisor = random.choice([6, 7, 8, 9, 11])
            return _int_mc(f"{n} ÷ {divisor} 的余数是多少？", n % divisor, divisor)
        if kind == "pattern":
            start, step = random.randint(3, 12), random.randint(4, 14)
            seq = [start + step * i for i in range(5)]
            return _int_mc(f"数列 {', '.join(map(str, seq))} 的下一项是多少？", seq[-1] + step, 10)
        people = random.randint(7, 14)
        return _int_mc(f"{people}个人两两握手一次，一共握手多少次？", people * (people - 1) // 2, 9)

    kind = random.choice(["power_remainder", "handshake", "digit", "logic", "speed"])
    if kind == "power_remainder":
        base = random.choice([2, 3, 4, 5, 6, 7])
        exp = random.randint(9, 16)
        divisor = random.choice([7, 9, 11])
        return _int_mc(f"{base}^{exp} 除以 {divisor} 的余数是多少？", pow(base, exp, divisor), divisor)
    if kind == "handshake":
        people = random.randint(12, 22)
        return _int_mc(f"{people}个人互相寄一张贺卡，一共寄出多少张？", people * (people - 1), 12)
    if kind == "digit":
        n = random.randint(120, 699)
        digit_sum = sum(int(ch) for ch in str(n))
        return _int_mc(f"{n} 的各位数字之和是多少？", digit_sum, 9)
    if kind == "logic":
        a = random.randint(4, 12)
        b = random.randint(15, 35)
        c = random.randint(3, 9)
        result = a * (b - c) + b % c
        return _int_mc(f"已知 a={a}，b={b}，c={c}，求 a×(b-c)+b÷c 的余数。", result, 9)
    distance = random.choice([120, 150, 180, 210, 240])
    time_hours = random.choice([2, 3, 4, 5])
    return _int_mc(f"一辆车 {time_hours} 小时行驶 {distance} 千米，每小时行驶多少千米？", distance // time_hours if distance % time_hours == 0 else distance / time_hours, 10)


def _build(value):
    value = int(value)
    if value == 1:
        return None
    if value == 2:
        a, b = random.randint(1, 9), random.randint(1, 9)
        if random.random() < 0.5:
            return _int_mc(f"{a} + {b} = ?", a + b, 4)
        high, low = max(a, b), min(a, b)
        return _int_mc(f"{high} - {low} = ?", high - low, 4)

    if value in (3, 4, 5, 6, 7, 8):
        grade = value - 2
        category = random.choice(["math", "chinese", "english"])
        if category == "math":
            return math_grade(grade)
        if category == "chinese":
            return chinese_grade(grade)
        return english_grade(grade)

    competition_question = competition(value)
    competition_question["id"] = _qid(value)
    competition_question["category"] = "competition"
    return competition_question


def generate(value):
    """Generate a fresh question; repeated text+choices are avoided."""
    if int(value) == 1:
        return None
    for _ in range(160):
        question = _build(value)
        key = (question["text"], tuple(question["choices"]))
        if key not in _seen:
            _seen.add(key)
            question["id"] = _qid(value)
            if "category" not in question:
                question["category"] = "math"
            return question
    # 组合空间极大；这里只是防御性兜底，不会把正确答案弄错。
    question = _build(value)
    question["text"] += f"（编号{random.randrange(10 ** 5)}）"
    question["id"] = _qid(value)
    if "category" not in question:
        question["category"] = "math"
    return question


def public_question(question):
    if not question:
        return None
    return {key: question[key] for key in ("id", "text", "choices", "category") if key in question}
