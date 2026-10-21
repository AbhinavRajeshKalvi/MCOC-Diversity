// The website's war-room palette (see the server's tailwind.config.ts), so the
// native screens and the planner web views look like one app.
export const colors = {
  ink: "#0D0F14",
  panel: "#161920",
  raised: "#20232C",
  line: "#2F333F",
  lighter: "#474C5C",
  parchment: "#EEF0F7",
  parchmentDim: "#A3A9C2",
  parchmentFaint: "#6E7591",
  brass: "#E0A93B",
  brassBright: "#F6C861",
  brassDim: "#9C7426",
  crimson: "#C2364E",
  crimsonBright: "#F05A72",
  teal: "#2FA88A",
  tealBright: "#4FD1A9",
  cosmic: "#38BDF8",
  tech: "#60A5FA",
  mutant: "#FACC15",
  skill: "#F87171",
  science: "#4ADE80",
  mystic: "#C084FC"
} as const;

export const CLASS_STRIPE = [colors.cosmic, colors.tech, colors.mutant, colors.skill, colors.science, colors.mystic];

export const fonts = {
  display: "BarlowCondensed_700Bold",
  displaySemi: "BarlowCondensed_600SemiBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  mono: "monospace"
} as const;

export const radius = { sm: 6, md: 10, lg: 14 } as const;
