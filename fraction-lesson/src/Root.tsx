import { Composition } from "remotion";
import { FractionLesson } from "./FractionLesson";
import { TOTAL_FRAMES, FPS } from "./script";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="FractionLesson"
      component={FractionLesson}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1280}
      height={720}
    />
  );
};
