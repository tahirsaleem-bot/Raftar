// Ten scenes. Cue times are fractions of the scene, never fixed frames: the narration is
// a real recording and its lines differ in length, so a scene laid out for six seconds has
// to hold up when it runs for sixteen.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { Breathe, Entrance, Mark, WordReveal } from "./components/Motion";
import { Screen } from "./components/Screen";

const PAD = theme.pad;

const useCue = () => {
  const { durationInFrames } = useVideoConfig();
  return (fraction: number) => Math.round(durationInFrames * fraction);
};
const useOut = () => useVideoConfig().durationInFrames - 12;

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontFamily: theme.fonts.display, fontSize: theme.size.eyebrow, fontWeight: 600,
    letterSpacing: "0.18em", textTransform: "uppercase", color: theme.colors.primary,
  }}>{children}</div>
);

const H: React.FC<{ text: string; delay: number; out: number; size?: number }> =
  ({ text, delay, out, size = theme.size.h2 }) => (
    <WordReveal text={text} delay={delay} out={out} style={{
      fontFamily: theme.fonts.display, fontSize: size, fontWeight: 300,
      lineHeight: 1.12, letterSpacing: -1.6, color: theme.colors.text, maxWidth: 1340,
    }} />
  );

const Body: React.FC<{ children: React.ReactNode; gold?: boolean; size?: number }> =
  ({ children, gold, size = theme.size.body }) => (
    <div style={{
      fontFamily: theme.fonts.body, fontSize: size, lineHeight: 1.5,
      color: gold ? theme.colors.primaryLift : theme.colors.textDim, maxWidth: 1120,
    }}>{children}</div>
  );

const Left: React.FC<{ children: React.ReactNode; top?: number; right?: number }> =
  ({ children, top = 190, right = PAD }) => (
    <div style={{ position: "absolute", left: PAD, right, top,
      display: "flex", flexDirection: "column", gap: 24 }}>{children}</div>
  );

const Pill: React.FC<{ children: React.ReactNode; off?: boolean }> = ({ children, off }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: 13, padding: "15px 26px",
    borderRadius: 999, background: "rgba(255,255,255,0.07)",
    border: `1px solid ${off ? "rgba(231,154,154,0.4)" : "rgba(255,255,255,0.16)"}`,
    fontFamily: theme.fonts.body, fontSize: 30,
    color: off ? "#e79a9a" : "#dbe8f4", alignSelf: "flex-start",
  }}>
    <span style={{ width: 12, height: 12, borderRadius: "50%",
      background: off ? "#c45a5a" : "#5fb97f" }} />
    {children}
  </div>
);

const MailCard: React.FC<{ from: string; subject: string; body: string; gold?: boolean }> =
  ({ from, subject, body, gold }) => (
    <div style={{ background: theme.colors.paper, color: theme.colors.ink, borderRadius: 16,
      boxShadow: "0 34px 90px rgba(0,0,0,0.45)", overflow: "hidden" }}>
      <div style={{ height: 11, background: gold ? theme.colors.primary : theme.colors.bgMid }} />
      <div style={{ padding: "28px 34px" }}>
        <div style={{ fontFamily: theme.fonts.body, fontSize: 24, color: "#6b7a8b" }}>{from}</div>
        <div style={{ fontFamily: theme.fonts.display, fontSize: 33, fontWeight: 600, marginTop: 7 }}>{subject}</div>
        <div style={{ fontFamily: theme.fonts.body, fontSize: 26, lineHeight: 1.55, color: "#44586b", marginTop: 14 }}>{body}</div>
      </div>
    </div>
  );


/** The control being named, in English, beside the step rather than over the screen. */
const ButtonChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: 12, alignSelf: "flex-start",
    background: theme.colors.primary, color: "#20160a", borderRadius: 999,
    padding: "11px 22px", fontFamily: theme.fonts.display, fontWeight: 600, fontSize: 29,
    boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
  }}>
    <span style={{ fontSize: 22, opacity: 0.75 }}>▸</span>{children}
  </div>
);

/* -------------------------------------------------------------- the scenes */

/** 0 — who is speaking, and the whole process in one breath before any detail. */
export const S0: React.FC = () => {
  const at = useCue(), out = useOut();
  const steps = ["A resignation arrives", "The interview is scheduled",
    "The record is written", "It replies on the same thread"];
  return (
    <AbsoluteFill>
      <Left top={200} right={760}>
        <Entrance delay={at(0.02)} out={out}><Eyebrow>People &amp; Culture · NIETE</Eyebrow></Entrance>
        <H text="I am Raftar." delay={at(0.05)} out={out} size={86} />
        <Entrance delay={at(0.14)} out={out}>
          <Body size={31}>Tahir Saleem’s agent. This is the whole process:</Body>
        </Entrance>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
          {steps.map((s, i) => (
            <Entrance key={i} delay={at(0.24) + i * 7} out={out} rise={0}>
              <Step n={i + 1}>{s}</Step>
            </Entrance>
          ))}
        </div>
      </Left>
    </AbsoluteFill>
  );
};

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
    <div style={{
      width: 42, height: 42, borderRadius: 10, flex: "none",
      background: theme.colors.primary, color: "#20160a",
      fontFamily: theme.fonts.display, fontWeight: 600, fontSize: 22,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>{n}</div>
    <div style={{ fontFamily: theme.fonts.body, fontSize: 33, color: theme.colors.text }}>{children}</div>
  </div>
);

/** 1 — the three shapes a resignation arrives in. */
export const S1: React.FC = () => {
  const at = useCue(), out = useOut();
  return (
    <AbsoluteFill>
      <Left>
        <H text="A resignation lands." delay={at(0.03)} out={out} />
        <Entrance delay={at(0.16)} out={out}>
          <Body>In the subject, in the body, or forwarded. All three count.</Body>
        </Entrance>
      </Left>
      <Entrance delay={at(0.3)} out={out}
        style={{ position: "absolute", left: PAD, top: 520, width: 790 }}>
        <MailCard from="From: the person leaving" subject="Resignation Email"
          body="Please accept my resignation…" />
      </Entrance>
      <Entrance delay={at(0.46)} out={out}
        style={{ position: "absolute", left: 1000, top: 520, width: 790 }}>
        <MailCard gold from="From: a colleague" subject="Fwd: Please take over"
          body="“@Tahir kindly arrange an exit interview for him.”" />
      </Entrance>
    </AbsoluteFill>
  );
};

/** 2 — the case opens by itself. */
export const S2: React.FC = () => {
  const at = useCue(), out = useOut();
  return (
    <AbsoluteFill>
      <Left>
        <Entrance delay={at(0.03)} out={out}><Eyebrow>Within fifteen minutes</Eyebrow></Entrance>
        <H text="The case opens itself." delay={at(0.09)} out={out} />
      </Left>
      <Entrance delay={at(0.34)} out={out}
        style={{ position: "absolute", left: PAD, top: 600, width: 980 }}>
        <MailCard gold from="To: tahir.saleem@niete.edu.pk" subject="Exit interview to schedule"
          body="The case is open and waiting for a time." />
      </Entrance>
    </AbsoluteFill>
  );
};

/** A step on a real screen: the camera travels onto the control being named. */
const Step3: React.FC<{
  eyebrow: string; head: string; note?: string; noteGold?: boolean;
  id: "schedule" | "edit" | "recipients" | "register";
  label?: string; headSize?: number;
}> = ({ eyebrow, head, note, noteGold, id, label, headSize = 58 }) => {
  const at = useCue(), out = useOut();
  return (
    <AbsoluteFill>
      <Left right={1060}>
        <Entrance delay={at(0.03)} out={out}><Eyebrow>{eyebrow}</Eyebrow></Entrance>
        <H text={head} delay={at(0.08)} out={out} size={headSize} />
        {label && (
          <Entrance delay={at(0.28)} out={out} rise={0}><ButtonChip>{label}</ButtonChip></Entrance>
        )}
        {note && (
          <Entrance delay={at(0.46)} out={out}>
            <Body gold={noteGold} size={30}>{note}</Body>
          </Entrance>
        )}
      </Left>
      <Screen id={id} delay={at(0.1)}
        style={{ position: "absolute", right: 90, top: 250, width: 980 }} />
    </AbsoluteFill>
  );
};

export const S3: React.FC = () => (
  <Step3 eyebrow="Step one" head="Pick a time." label="Send invite"
    note="The name and the address are already filled in." id="schedule" />
);

/** 4 — who the invite reaches. */
export const S4: React.FC = () => {
  const at = useCue(), out = useOut();
  const people = ["The leaver", "Whoever asked for the interview",
    "People & Culture", "The notetaker, which records the call"];
  return (
    <Left>
      <H text="The invite reaches four." delay={at(0.03)} out={out} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 20 }}>
        {people.map((p, i) => (
          <Entrance key={i} delay={at(0.2) + i * 5} out={out} rise={0}><Pill>{p}</Pill></Entrance>
        ))}
      </div>
    </Left>
  );
};

/** 5 — the record writes itself, in their words. */
export const S5: React.FC = () => {
  const at = useCue(), out = useOut();
  const lines = [38, 96, 89, 30, 93, 72, 84, 58, 91, 66];
  return (
    <AbsoluteFill>
      <Left right={980}>
        <H text="The record writes itself." delay={at(0.03)} out={out} size={62} />
        <Entrance delay={at(0.42)} out={out}>
          <div style={{ borderLeft: `5px solid ${theme.colors.primary}`, paddingLeft: 26,
            fontFamily: theme.fonts.body, fontStyle: "italic", fontSize: 33, lineHeight: 1.45,
            color: "#f0dcae", maxWidth: 800 }}>
            “Haftay mein chaar din field mein, aur report phir bhi raat ko.”
          </div>
        </Entrance>
        <Entrance delay={at(0.62)} out={out}>
          <Body size={28}>Kept exactly as they said it.</Body>
        </Entrance>
      </Left>
      <Entrance delay={at(0.12)} out={out}
        style={{ position: "absolute", right: PAD, top: 180, width: 740 }}>
        <div style={{ background: theme.colors.paper, borderRadius: 12, overflow: "hidden",
          boxShadow: "0 40px 110px rgba(0,0,0,0.5)" }}>
          <div style={{ background: theme.colors.bgMid, padding: "24px 30px 20px",
            borderBottom: `5px solid ${theme.colors.primary}` }}>
            <div style={{ fontFamily: theme.fonts.display, fontSize: 14, letterSpacing: "0.2em",
              textTransform: "uppercase", color: theme.colors.accent, fontWeight: 600 }}>
              Human Resources · Separation Documentation</div>
            <div style={{ fontFamily: theme.fonts.display, fontSize: 32, fontWeight: 500,
              color: theme.colors.text, marginTop: 6 }}>Exit Interview Record</div>
          </div>
          <div style={{ padding: "24px 30px", minHeight: 380 }}>
            {lines.map((w, i) => <DocLine key={i} width={w} index={i} start={at(0.2)} />)}
          </div>
        </div>
      </Entrance>
    </AbsoluteFill>
  );
};

const DocLine: React.FC<{ width: number; index: number; start: number }> =
  ({ width, index, start }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = spring({ frame: frame - start - index * 5, fps, config: theme.spring.smooth });
    const heading = index === 0 || index === 3;
    const quote = index === 6 || index === 7;
    return (
      <div style={{
        height: heading ? 17 : 12, width: `${width}%`, borderRadius: 7,
        marginBottom: heading ? 19 : 14,
        background: heading ? theme.colors.bgMid : quote ? "#f0dcae" : "#dde4ec",
        borderLeft: index === 6 ? `4px solid ${theme.colors.primary}` : undefined,
        transform: `scaleX(${p})`, transformOrigin: "left center",
      }} />
    );
  };

export const S6: React.FC = () => (
  <Step3 eyebrow="Step two" head="Wrong word? Fix it." label="Edit the wording"
    note="From the phone. No laptop." id="edit" />
);
export const S7: React.FC = () => (
  <Step3 eyebrow="Who receives it" head="Everyone on the thread." headSize={54}
    label="Copied to" note="Never the leaver. That is blocked outright."
    noteGold id="recipients" />
);
export const S8: React.FC = () => (
  <Step3 eyebrow="All of them, in one place" head="Interviews on record."
    note="Each one opens its filed PDF." id="register" />
);

/** 9 — the close: the two human decisions, both marks, and a thank you. */
export const S9: React.FC = () => {
  const at = useCue();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <WordReveal text="Two decisions stay human." delay={at(0.03)} style={{
        fontFamily: theme.fonts.display, fontSize: 70, fontWeight: 300,
        color: theme.colors.text, justifyContent: "center" }} />
      <Entrance delay={at(0.2)} style={{ marginTop: 14 }}>
        <Body size={32}>When to meet, and what gets sent.</Body>
      </Entrance>

      <div style={{ display: "flex", alignItems: "center", gap: 52, marginTop: 58 }}>
        <Breathe amount={0.008} speed={1.1}>
          <Mark src="logo_taleemabad.png" height={150} pad={34} radius={24} delay={at(0.36)} />
        </Breathe>
        <Breathe amount={0.008} speed={1.3}>
          <Mark src="logo_niete.png" height={116} pad={34} radius={24} delay={at(0.42)} />
        </Breathe>
      </div>

      <Entrance delay={at(0.58)} rise={0} style={{ marginTop: 40, marginBottom: 26 }}>
        <div style={{ width: 280, height: 4, background: theme.colors.primary, borderRadius: 2 }} />
      </Entrance>
      <Entrance delay={at(0.64)}>
        <div style={{ fontFamily: theme.fonts.urdu, fontSize: 62, lineHeight: 1.9,
          color: theme.colors.primaryLift }}>شکریہ</div>
      </Entrance>
      <WordReveal text="Thank you" delay={at(0.76)} style={{
        fontFamily: theme.fonts.display, fontSize: 50, fontWeight: 300,
        color: theme.colors.text, justifyContent: "center" }} />
    </AbsoluteFill>
  );
};

export const SCENE_COMPONENTS = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9];
