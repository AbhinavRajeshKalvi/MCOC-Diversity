// What each node on the Big Things map does, typed up from the in-game node
// details. The challenges say how the attacker earns Force Charges there; the
// effects are the node's other buffs. Safe to import from client code.

export type NodeEffect = { name: string; text: string };
export type BigThingsNodeInfo = { challenges: NodeEffect[]; effects: NodeEffect[] };

export const BIG_THINGS_NODE_INFO: Record<number, BigThingsNodeInfo> = {
  1: {
    challenges: [
      {
        name: "Dexterity",
        text: "When the Attacker Dodges a Basic Attack, they gain 2 Force Charge. Dodging a hit from a Special Attack grants 3 Force Charges."
      }
    ],
    effects: [{ name: "Immunity (Stun)", text: "The Defender is Immune to Stun effects." }]
  },
  2: {
    challenges: [
      {
        name: "Buff Safety",
        text: "When the Attacker is Immune to Nullify, gain 5 Force Charges. When the Attacker is Immune to a Buff, gain 1 Force Charge."
      }
    ],
    effects: [
      {
        name: "Power Snack - 2",
        text: "When the Attacker triggers a Buff, it is immediately Nullified and the Defender gains 50% of a bar of power. This ability has a 7 second cooldown."
      },
      {
        name: "Combat Déjà vu (Placebo) - 2",
        text: "Whenever the Attacker lands the same type of Basic Attack twice in a row, they gain a Placebo Buff for 8 seconds."
      }
    ]
  },
  3: {
    challenges: [
      {
        name: "Bandaid Solution",
        text: "While the defender is prevented from recovering health, or dealt damage from a Regeneration effect while their Regeneration Rate is below 0, gain 1 Force Charge."
      }
    ],
    effects: [
      {
        name: "Never Back Down - 2",
        text: "When the Attacker dashes back, they gain a Regeneration Timer for 1.20 second(s). Dashing back again while the Regeneration Timer is active grants the Defender a Regeneration Passive restoring 7.50% of their Max Health over 5 seconds. Max 1 stack."
      },
      {
        name: "Always Forward",
        text: "The Defender cannot heal above the amount of Health they started the fight with."
      }
    ]
  },
  4: {
    challenges: [
      { name: "Combo", text: "When the Attacker's Combo Meter passes a multiple of 10, gain 8 Force Charges." }
    ],
    effects: [
      {
        name: "Painful Retreat - 2",
        text: "Every 12 seconds, the Attacker is inflicted with a non-stacking Power Sting Debuff for 10 seconds that deals 70% of the Defender's Attack Rating as damage. Remove this Power Stings for every 10 hits on the Attacker's Combo Meter."
      }
    ]
  },
  5: {
    challenges: [{ name: "Intercept", text: "When Intercepting the Defender, gain 7 Force Charges." }],
    effects: [
      {
        name: "Ebb and Flow - Intercept",
        text: "The Defender has Protection, reducing all incoming damage by 60%. Intercepting the Defender removes the Protection and grants the Attacker a Fury Passive, increasing Attack Rating by 40% for 12 second(s). When the Fury expires, the Protection returns, and all Debuffs on the Defender are Purified."
      }
    ]
  },
  6: {
    challenges: [
      {
        name: "Debuff Control",
        text: "When the Defender Purifies, Cleanses, or is Immune to a Debuff, gain 4 Force Charges."
      }
    ],
    effects: [
      {
        name: "Palette Cleanser - 1",
        text: "Whenever either Champion gains a Bar of Power, the Defender gains 1 stack(s) of Cleanse Passive lasting 5 seconds."
      },
      {
        name: "Standing in Fear (Fatigue)",
        text: "For every 2.20 seconds the Attacker is close to the Defender, the Defender gains an indefinite 10% Fatigue Debuff. Every 2 seconds away from the Defender removes one of these Debuffs."
      }
    ]
  },
  7: {
    challenges: [{ name: "Rooted", text: "When striking a Defender suffering from Root, gain 5 Force Charges." }],
    effects: [
      {
        name: "Root or Rooted",
        text: "Every 12 seconds, the Attacker gets Passively Rooted for 5 seconds. If the Attacker is far away from the Defender when this triggers, the Defender gets Passively Rooted instead. The timer will only restart after the Root has expired and it is paused during Specials."
      }
    ]
  },
  8: {
    challenges: [
      {
        name: "Buff Control",
        text: "When one of the Defender's Buffs is Nullified, Staggered, or expires, or when a Buff is prevented by Ability Accuracy or Immunity, gain 3 Force Charges."
      }
    ],
    effects: [
      {
        name: "Energetic Exercise - 2",
        text: "Each time the Defender gains a buff, they gain an Energize Buff lasting for 10 seconds, increasing the Defender Combat Power Rate by 8%. Max Stacks: 10"
      },
      {
        name: "Feats of Power",
        text: "While the Defender is above 1 Bar of Power, they gain a +200% Fury Buff. While above 2 Bars of Power, a +50% Precision Buff. While at 3 Bars of Power, a +50% Cruelty Buff."
      }
    ]
  },
  9: {
    challenges: [
      {
        name: "Punishment",
        text: "When Punishing or Interrupting the Defender's Special or Heavy Attacks, gain 5 Force Charges."
      }
    ],
    effects: [{ name: "Power Efficiency", text: "The Defender's Special Attacks cost 50% less Power." }]
  },
  10: {
    challenges: [
      {
        name: "Good Health",
        text: "When the Attacker Purifies or Cleanses a Debuff, or is Immune to any effect, gain 2 Force Charges."
      },
      {
        name: "Resistance",
        text: "When an Incinerate or Shock from Hazard Shift is inflicted with reduced potency, gain 2 Force Charges."
      }
    ],
    effects: [
      {
        name: "Hazard Shift - Incinerate, Shock",
        text: "Striking the Defender has a 40% chance to inflict the Attacker with a Incinerate Debuff, dealing 30% of the Defender's Attack in Damage over 7 second(s). Every 12 second(s), this is swapped for a chance to inflict Shock instead."
      }
    ]
  }
};
