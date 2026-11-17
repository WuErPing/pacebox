import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

export type Gesture = "v-open" | "hold" | "horizontal" | "vertical";

const LABELS: Record<Gesture, string> = {
  "v-open": "乔布斯 V 字打开手势动作图",
  hold: "抱个西瓜动作图",
  horizontal: "横切西瓜动作图",
  vertical: "竖劈西瓜动作图",
};

function Person() {
  return (
    <>
      <Circle cx="120" cy="28" r="12" fill="#CBD5E1" />
      <Path d="M120 43 V92" stroke="#94A3B8" strokeWidth="11" strokeLinecap="round" />
      <Path d="M120 91 L105 126 M120 91 L135 126" stroke="#64748B" strokeWidth="8" strokeLinecap="round" />
    </>
  );
}

function VOpen() {
  return (
    <>
      <Path d="M113 53 L84 48 L55 22 M127 53 L156 48 L185 22" fill="none" stroke="#38BDF8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M53 21 L45 12 M55 20 L54 8 M187 21 L195 12 M185 20 L186 8" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" />
      <Path d="M35 68 Q25 45 37 29 M205 68 Q215 45 203 29" fill="none" stroke="#155E75" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
    </>
  );
}

function Watermelon({ gesture }: { gesture: "hold" | "horizontal" | "vertical" }) {
  if (gesture === "hold") {
    return (
      <>
        <Path d="M112 54 L91 63 Q78 77 96 89 M128 54 L149 63 Q162 77 144 89" fill="none" stroke="#38BDF8" strokeWidth="8" strokeLinecap="round" />
        <Path d="M96 89 Q120 101 144 89" fill="none" stroke="#38BDF8" strokeWidth="6" strokeLinecap="round" />
        <Path d="M93 72 Q120 52 147 72 Q153 91 120 96 Q87 91 93 72 Z" fill="#164E63" fillOpacity={0.25} stroke="#67E8F9" strokeWidth="2" strokeDasharray="5 4" />
      </>
    );
  }

  if (gesture === "horizontal") {
    return (
      <>
        <Path d="M112 55 L96 71 L91 82 M128 55 L151 68 L169 68" fill="none" stroke="#38BDF8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M91 72 Q120 57 149 72 Q153 90 120 95 Q87 90 91 72 Z" fill="#164E63" fillOpacity={0.25} stroke="#67E8F9" strokeWidth="2" strokeDasharray="5 4" />
        <Line x1="87" y1="76" x2="164" y2="76" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
        <Path d="M155 69 L165 76 L155 83" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  }

  return (
    <>
      <Path d="M112 55 L98 75 L96 88 M128 55 L140 33 L124 13" fill="none" stroke="#38BDF8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M94 79 Q120 64 146 79 Q150 98 120 103 Q90 98 94 79 Z" fill="#164E63" fillOpacity={0.25} stroke="#67E8F9" strokeWidth="2" strokeDasharray="5 4" />
      <Line x1="125" y1="28" x2="125" y2="91" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
      <Path d="M118 82 L125 93 L132 82" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

export function GestureIllustration({ gesture }: { gesture: Gesture }) {
  return (
    <View
      accessible
      accessibilityLabel={LABELS[gesture]}
      accessibilityRole="image"
      style={styles.frame}
    >
      <Svg width="100%" height="100%" viewBox="0 0 240 140">
        <Rect width="240" height="140" rx="8" fill="#0F172A" />
        <Path d="M65 130 H175" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
        <Person />
        {gesture === "v-open" ? <VOpen /> : <Watermelon gesture={gesture} />}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    height: 150,
    overflow: "hidden",
    width: "100%",
  },
});
