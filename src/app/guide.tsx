import {
  ArrowRight,
  CircleCheck,
  Eye,
  Flag,
  Footprints,
  Hand,
  ListOrdered,
  MessageSquareText,
  Move,
  Pause,
  Smile,
  Target,
  type LucideIcon,
} from "lucide-react-native";
import {
  Image,
  type ImageSourcePropType,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  GestureIllustration,
  type Gesture,
} from "@/components/gesture-illustration";

interface GuideItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

const SPEECH_POINTS: GuideItem[] = [
  {
    icon: Target,
    title: "只留一个核心信息",
    description:
      "如果观众只能记住一句话，你希望是什么？让每段内容都为这句话服务。",
  },
  {
    icon: ListOrdered,
    title: "用三段式组织内容",
    description:
      "开场点明主题，主体控制在 2–3 个要点，结尾回扣核心并给出行动。",
  },
  {
    icon: MessageSquareText,
    title: "用例子代替堆砌",
    description:
      "每个要点配一个具体案例、数字或故事；先讲结论，再补证据。",
  },
  {
    icon: ArrowRight,
    title: "把转场说出口",
    description:
      "用“先看……接下来……最后……”提示进度，让观众始终知道你在讲哪里。",
  },
  {
    icon: Flag,
    title: "明确收束，不要突然结束",
    description:
      "结尾再次说出核心信息，并告诉观众接下来该做什么，然后停下。",
  },
];

const BODY_LANGUAGE: GuideItem[] = [
  {
    icon: Footprints,
    title: "站稳，双脚与肩同宽",
    description:
      "重心均匀，膝盖自然，不来回摇晃；需要移动时，走到位置后再次站稳。",
  },
  {
    icon: Eye,
    title: "眼神停留，而非扫视",
    description:
      "每次看向一位观众约 3–5 秒，再换到另一个区域；别一直盯屏幕或天花板。",
  },
  {
    icon: Hand,
    title: "手势开放，动作有始有终",
    description:
      "手掌自然打开，在腰部到肩部之间比划；说完要点后让双手回到自然位置。",
  },
  {
    icon: Move,
    title: "为强调而移动",
    description:
      "平时站稳，转换要点或靠近观众时再迈步；避免无意识踱步和背对观众。",
  },
  {
    icon: Smile,
    title: "让表情与内容一致",
    description:
      "开场和致谢时自然微笑，讲到严肃内容时收起笑容；保持眉眼放松。",
  },
  {
    icon: Pause,
    title: "用停顿代替小动作",
    description:
      "重要句子前后停一拍，同时放下双手、保持目光；避免摸脸、插兜或玩翻页笔。",
  },
];

interface SpeakerExample {
  pose: "jobs" | "obama" | "oprah";
  photo: ImageSourcePropType;
  photoAlt: string;
  photoFit: "cover" | "contain";
  credit: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  name: string;
  description: string;
  practice: string;
}

const SPEAKER_EXAMPLES: SpeakerExample[] = [
  {
    pose: "jobs",
    photo: require("../../assets/guide/steve-jobs-cropped.jpg"),
    photoAlt: "乔布斯在 iPhone 发布会上伸出手掌的真人照片",
    photoFit: "cover",
    credit: "Acaben（本地裁切）",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Steve_Jobs_presents_iPhone.jpg",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    name: "乔布斯｜V 字打开手势",
    description:
      "从乔布斯的开放手掌延伸到 V 字练习：双臂向外上方打开，手掌朝向观众，适合开场或描绘愿景。",
    practice:
      "先抱个西瓜，再把双手向斜上方打开成 V 字，停 1 秒后收回。肩膀放松，不要举过头顶。",
  },
  {
    pose: "obama",
    photo: require("../../assets/guide/barack-obama-cropped.jpg"),
    photoAlt: "奥巴马在演讲中抬手强调的真人照片",
    photoFit: "cover",
    credit: "Chad Davis（本地裁切）",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:20080603_Obama_Speaks_on_Nomination_Victory_Night.jpg",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    name: "奥巴马｜小幅度强调",
    description:
      "手指轻合、动作收在肩宽以内；一句话只给一个强调，不连续比划。",
    practice:
      "说“最关键的一点”时抬手，句尾立刻放松双手，避免指尖用力。",
  },
  {
    pose: "oprah",
    photo: require("../../assets/guide/oprah-winfrey.jpg"),
    photoAlt: "奥普拉手心向上打开双臂的真人照片",
    photoFit: "contain",
    credit: "Alan Light",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Oprah_Winfrey_(2004).jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    name: "奥普拉｜开放双臂",
    description:
      "手心向上、双臂从身体两侧打开，配合微笑，适合欢迎和感谢。",
    practice:
      "开场说“欢迎大家”时打开双臂，停 1 秒后收回；不要全程保持张开。",
  },
];

const PEXELS_LICENSE_URL = "https://www.pexels.com/license/";

const WATERMELON_GESTURES: {
  gesture: Exclude<Gesture, "v-open">;
  photo: ImageSourcePropType;
  photoAlt: string;
  credit: string;
  sourceUrl: string;
  title: string;
  description: string;
  practice: string;
}[] = [
  {
    gesture: "hold",
    photo: require("../../assets/guide/speaker-hold.png"),
    photoAlt: "TED 演讲者双手在腹前围合的照片",
    credit: "Pexels / TED（16.0s 截帧）",
    sourceUrl:
      "https://www.pexels.com/video/a-man-talking-with-hand-gestures-4106314/",
    title: "抱个西瓜",
    description:
      "双手在腹前围成圆弧，像抱住一颗西瓜；肩膀放松，手肘离开身体一点。",
    practice: "这是手势的起始位。开口前先摆好，停 1 秒。",
  },
  {
    gesture: "horizontal",
    photo: require("../../assets/guide/speaker-horizontal.png"),
    photoAlt: "TED 演讲者水平切分手势的照片",
    credit: "Pexels / TED（14.0s 截帧）",
    sourceUrl:
      "https://www.pexels.com/video/a-man-talking-with-hand-gestures-4106314/",
    title: "横切西瓜",
    description:
      "一手扶住“西瓜”，另一手沿水平方向切过去，用来表达分类、对比或两个层次。",
    practice: "说“一方面……另一方面……”时切到一侧，停住，不要来回锯。",
  },
  {
    gesture: "vertical",
    photo: require("../../assets/guide/speaker-vertical.png"),
    photoAlt: "TED 演讲者向下切分手势的照片",
    credit: "Pexels / TED（10.75s 截帧）",
    sourceUrl:
      "https://www.pexels.com/video/a-man-talking-with-hand-gestures-4106314/",
    title: "竖劈西瓜",
    description:
      "一手稳住，另一手从上到下做一次清楚的切分，用来强调重点或结论。",
    practice: "说“最关键的是……”时向下切一次，句尾马上停住。",
  },
];

const STAGE_CHECKS = [
  "双脚站稳，膝盖保持自然",
  "肩膀放松，下巴微微收回",
  "深呼吸一次，把目光投向观众",
  "停顿一秒，再清晰说出第一句",
];

function GuideSection({ title, items }: { title: string; items: GuideItem[] }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.list}>
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <View
              key={item.title}
              style={[styles.item, index < items.length - 1 && styles.itemBorder]}
            >
              <Icon color="#38BDF8" size={20} />
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDescription}>{item.description}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function GuideScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>上台前记住这一句</Text>
        <Text accessibilityRole="header" style={styles.heroTitle}>
          先站稳，再开口。
        </Text>
        <Text style={styles.heroDescription}>
          好演讲不只靠内容。清楚的结构让观众听得懂，稳定的身体语言让观众愿意相信你。
        </Text>
      </View>

      <GuideSection title="演讲要点" items={SPEECH_POINTS} />
      <GuideSection title="经典身体语言" items={BODY_LANGUAGE} />

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          名人示范：一次只学一个动作
        </Text>
        <Text style={styles.sectionIntro}>
          观察真人照片中的动作，再用下面的步骤练习。照片已打包到本地，无需联网加载。
        </Text>
        <View style={styles.exampleList}>
          {SPEAKER_EXAMPLES.map((example) => (
            <View key={example.pose} style={styles.exampleCard}>
              <View style={styles.photoFrame}>
                <Image
                  accessibilityLabel={example.photoAlt}
                  resizeMode={example.photoFit}
                  source={example.photo}
                  style={styles.photo}
                />
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>真人照片</Text>
                </View>
              </View>
              <View style={styles.exampleCopy}>
                <Text style={styles.exampleName}>{example.name}</Text>
                <Text style={styles.exampleDescription}>
                  {example.description}
                </Text>
                {example.pose === "jobs" ? (
                  <View style={styles.gestureFigure}>
                    <GestureIllustration gesture="v-open" />
                    <Text style={styles.gestureCaption}>
                      动作拆解：双臂形成舒缓的 V 字，手掌打开，肩膀下沉
                    </Text>
                  </View>
                ) : null}
                <View style={styles.practice}>
                  <Text style={styles.practiceLabel}>照着练</Text>
                  <Text style={styles.practiceText}>{example.practice}</Text>
                </View>
                <View style={styles.creditRow}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(example.sourceUrl)}
                  >
                    <Text style={styles.photoCredit}>
                      照片：{example.credit} / Wikimedia Commons
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(example.licenseUrl)}
                  >
                    <Text style={styles.photoCredit}>{example.license}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          西瓜手势：先定位，再切分
        </Text>
        <Text style={styles.sectionIntro}>
          三张照片均来自真实演讲视频截帧。观察演讲者的手位，再对照示意图练习；照片只作动作参考，不必完全复制。
        </Text>
        <View style={styles.watermelonList}>
          {WATERMELON_GESTURES.map((item, index) => (
            <View key={item.gesture} style={styles.watermelonCard}>
              <View style={styles.watermelonPhotoFrame}>
                <Image
                  accessibilityLabel={item.photoAlt}
                  resizeMode="cover"
                  source={item.photo}
                  style={styles.photo}
                />
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>真人演讲照片</Text>
                </View>
              </View>
              <GestureIllustration gesture={item.gesture} />
              <View style={styles.watermelonCopy}>
                <Text style={styles.watermelonTitle}>
                  {index + 1}. {item.title}
                </Text>
                <Text style={styles.exampleDescription}>{item.description}</Text>
                <Text style={styles.watermelonPractice}>{item.practice}</Text>
                <View style={styles.creditRow}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(item.sourceUrl)}
                  >
                    <Text style={styles.photoCredit}>视频：{item.credit}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(PEXELS_LICENSE_URL)}
                  >
                    <Text style={styles.photoCredit}>Pexels 许可</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.checklist}>
        <Text accessibilityRole="header" style={styles.checklistTitle}>
          上台前 60 秒自检
        </Text>
        {STAGE_CHECKS.map((check) => (
          <View key={check} style={styles.checkRow}>
            <CircleCheck color="#34D399" size={18} />
            <Text style={styles.checkText}>{check}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  content: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    padding: 24,
    paddingBottom: 40,
  },
  hero: {
    borderLeftColor: "#38BDF8",
    borderLeftWidth: 3,
    gap: 8,
    paddingLeft: 16,
    paddingVertical: 4,
  },
  eyebrow: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "600",
  },
  heroTitle: {
    color: "#F8FAFC",
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 36,
  },
  heroDescription: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 22,
  },
  section: {
    gap: 12,
    marginTop: 32,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
  },
  list: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  item: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16,
  },
  itemBorder: {
    borderBottomColor: "#334155",
    borderBottomWidth: 1,
  },
  itemCopy: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  itemDescription: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 21,
  },
  sectionIntro: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 20,
  },
  photoFrame: {
    aspectRatio: 3 / 2,
    backgroundColor: "#0F172A",
    position: "relative",
  },
  photo: {
    height: "100%",
    width: "100%",
  },
  photoBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderRadius: 6,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    top: 12,
  },
  photoBadgeText: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "600",
  },
  exampleList: {
    gap: 16,
  },
  exampleCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    overflow: "hidden",
  },
  exampleCopy: {
    gap: 8,
    padding: 16,
  },
  exampleName: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
  },
  exampleDescription: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 22,
  },
  gestureFigure: {
    gap: 6,
    marginTop: 4,
  },
  gestureCaption: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
  practice: {
    borderLeftColor: "#38BDF8",
    borderLeftWidth: 2,
    gap: 3,
    marginTop: 4,
    paddingLeft: 10,
  },
  practiceLabel: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "600",
  },
  practiceText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 20,
  },
  creditRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  photoCredit: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    textDecorationLine: "underline",
  },
  watermelonPhotoFrame: {
    aspectRatio: 16 / 9,
    backgroundColor: "#0F172A",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  watermelonList: {
    gap: 16,
  },
  watermelonCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    gap: 12,
    padding: 16,
  },
  watermelonCopy: {
    gap: 8,
  },
  watermelonTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
  },
  watermelonPractice: {
    color: "#38BDF8",
    fontSize: 13,
    lineHeight: 20,
  },
  checklist: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginTop: 32,
    padding: 16,
  },
  checklistTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  checkText: {
    color: "#CBD5E1",
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
