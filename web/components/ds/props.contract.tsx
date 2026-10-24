// Compile-time public contract checks; included in `npm run typecheck`.
import { ScoreTeaserCard } from "./ScoreTeaserCard";

const notify = () => {};
const approved = <ScoreTeaserCard onNotify={notify} />;
// @ts-expect-error Scores must never enter the teaser component.
const noScore = <ScoreTeaserCard onNotify={notify} score={10} />;
// @ts-expect-error No arbitrary numeric display props are supported.
const noPlaceholder = <ScoreTeaserCard onNotify={notify} placeholder={10} />;
void [approved, noScore, noPlaceholder];
