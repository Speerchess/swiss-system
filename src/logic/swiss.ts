import type { Player, Match } from './types';

// Helper to check if two players have played each other
export function havePlayed(p1: Player, p2Id: string): boolean {
  return p1.opponents.includes(p2Id);
}

// Helper to count color history
export function getColorStats(player: Player) {
  let whiteCount = 0;
  let blackCount = 0;

  // Count total W and B in history
  for (const col of player.colors) {
    if (col === 'W') whiteCount++;
    if (col === 'B') blackCount++;
  }

  // Count consecutive same colors at the end of history
  let consecutiveSame = 0;
  let lastColor: 'W' | 'B' | null = null;

  for (let i = player.colors.length - 1; i >= 0; i--) {
    const col = player.colors[i];
    if (col === 'BYE') continue; // Skip byes in color history

    if (lastColor === null) {
      lastColor = col as 'W' | 'B';
      consecutiveSame = 1;
    } else if (lastColor === col) {
      consecutiveSame++;
    } else {
      break; // Color changed, stop counting consecutive
    }
  }

  return {
    whiteCount,
    blackCount,
    currentDiff: whiteCount - blackCount,
    consecutiveSame,
    lastColor,
  };
}

// Check if color assignment is legal under standard Swiss rules
// Rule 1: No player can play the same color 3 times in a row
// Rule 2: Color difference limit (|W - B| <= 2)
export function isColorAssignmentLegal(
  player: Player,
  assignedColor: 'W' | 'B',
  level: 1 | 2 | 3 // level of strictness
): boolean {
  const stats = getColorStats(player);

  // Level 1: Strict color difference (<= 2) and strict consecutive (< 3)
  if (level === 1) {
    const newDiff = stats.currentDiff + (assignedColor === 'W' ? 1 : -1);
    if (Math.abs(newDiff) > 2) return false;
    if (stats.consecutiveSame >= 2 && stats.lastColor === assignedColor) return false;
  }
  
  // Level 2: Relax color difference, but strictly forbid 3 consecutive same color
  if (level === 2) {
    if (stats.consecutiveSame >= 2 && stats.lastColor === assignedColor) return false;
  }

  // Level 3: Relax everything
  return true;
}

// Determine who gets White (player1) and who gets Black (player2)
// Returns [whitePlayerId, blackPlayerId]
export function determineColors(p1: Player, p2: Player): [string, string] {
  const stats1 = getColorStats(p1);
  const stats2 = getColorStats(p2);

  // Preference is to play the color that reduces the absolute color difference
  const pref1 = stats1.currentDiff > 0 ? 'B' : stats1.currentDiff < 0 ? 'W' : null;
  const pref2 = stats2.currentDiff > 0 ? 'B' : stats2.currentDiff < 0 ? 'W' : null;

  if (pref1 && !pref2) {
    return pref1 === 'W' ? [p1.id, p2.id] : [p2.id, p1.id];
  }
  if (!pref1 && pref2) {
    return pref2 === 'W' ? [p2.id, p1.id] : [p1.id, p2.id];
  }
  if (pref1 && pref2 && pref1 !== pref2) {
    return pref1 === 'W' ? [p1.id, p2.id] : [p2.id, p1.id];
  }
  if (pref1 && pref2 && pref1 === pref2) {
    if (Math.abs(stats1.currentDiff) > Math.abs(stats2.currentDiff)) {
      return pref1 === 'W' ? [p1.id, p2.id] : [p2.id, p1.id];
    } else if (Math.abs(stats1.currentDiff) < Math.abs(stats2.currentDiff)) {
      return pref1 === 'W' ? [p2.id, p1.id] : [p1.id, p2.id];
    }
  }

  // If neutral, check last color
  if (stats1.lastColor && stats2.lastColor && stats1.lastColor !== stats2.lastColor) {
    return stats1.lastColor === 'W' ? [p2.id, p1.id] : [p1.id, p2.id];
  }

  if (stats1.lastColor && stats1.lastColor === stats2.lastColor) {
    if (stats1.consecutiveSame > stats2.consecutiveSame) {
      return stats1.lastColor === 'W' ? [p2.id, p1.id] : [p1.id, p2.id];
    } else if (stats1.consecutiveSame < stats2.consecutiveSame) {
      return stats1.lastColor === 'W' ? [p1.id, p2.id] : [p2.id, p1.id];
    }
  }

  // Fallback: Rating or deterministic ID comparison
  const roundNum = p1.colors.length + 1;
  const rating1 = p1.rating ?? 0;
  const rating2 = p2.rating ?? 0;

  if (rating1 !== rating2) {
    const higherIsP1 = rating1 > rating2;
    if (roundNum % 2 === 1) {
      return higherIsP1 ? [p1.id, p2.id] : [p2.id, p1.id];
    } else {
      return higherIsP1 ? [p2.id, p1.id] : [p1.id, p2.id];
    }
  }

  return p1.id < p2.id ? [p1.id, p2.id] : [p2.id, p1.id];
}

type PairWithColors = { p1: Player; p2: Player; whiteId: string; blackId: string };

// Backtracking solver using candidate priorities to match score groups and split halves
function solvePairings(
  players: Player[],
  index: number,
  paired: Set<string>,
  pairs: PairWithColors[],
  colorConstraintLevel: 1 | 2 | 3,
  avoidReplays: boolean
): PairWithColors[] | null {
  if (index >= players.length) {
    return [...pairs];
  }

  const p1 = players[index];
  if (paired.has(p1.id)) {
    return solvePairings(players, index + 1, paired, pairs, colorConstraintLevel, avoidReplays);
  }

  // Get all active, unpaired candidates
  const candidates = players.filter((p) => p.id !== p1.id && !paired.has(p.id));

  // Sort candidates by preference:
  // 1. Same score group, counterpart (split-half counterpart)
  // 2. Same score group, others
  // 3. Floaters (score difference * 10 penalty)
  const getCandidatePriority = (p2: Player) => {
    const scoreDiff = Math.abs(p1.score - p2.score);
    
    // Check split-half counterpart inside the same score group
    const sameScoreGroup = players.filter((p) => p.score === p1.score && !paired.has(p.id));
    const p1Idx = sameScoreGroup.findIndex((p) => p.id === p1.id);
    const p2Idx = sameScoreGroup.findIndex((p) => p.id === p2.id);
    
    let isCounterpart = false;
    if (p1Idx !== -1 && p2Idx !== -1) {
      const half = Math.floor(sameScoreGroup.length / 2);
      if (p1Idx < half && p2Idx === p1Idx + half) {
        isCounterpart = true;
      } else if (p1Idx >= half && p2Idx === p1Idx - half) {
        isCounterpart = true;
      }
    }

    let priority = scoreDiff * 10;
    if (scoreDiff === 0) {
      priority = isCounterpart ? -100 : 0;
    }
    return priority;
  };

  const sortedCandidates = [...candidates].sort((a, b) => {
    const prioA = getCandidatePriority(a);
    const prioB = getCandidatePriority(b);
    if (prioA !== prioB) return prioA - prioB;
    
    // Tiebreaker: Rating descending
    const rA = a.rating ?? 0;
    const rB = b.rating ?? 0;
    return rB - rA;
  });

  for (const p2 of sortedCandidates) {
    // Rule 0: No replays
    if (avoidReplays && havePlayed(p1, p2.id)) {
      continue;
    }

    // Try both color assignments: preferred first, then swapped
    const [preferredWhiteId, preferredBlackId] = determineColors(p1, p2);
    const colorOptions: [string, string][] = [
      [preferredWhiteId, preferredBlackId],
      [preferredBlackId, preferredWhiteId], // swapped
    ];

    for (const [whiteId, blackId] of colorOptions) {
      const p1Color: 'W' | 'B' = whiteId === p1.id ? 'W' : 'B';
      const p2Color: 'W' | 'B' = whiteId === p2.id ? 'W' : 'B';

      if (
        !isColorAssignmentLegal(p1, p1Color, colorConstraintLevel) ||
        !isColorAssignmentLegal(p2, p2Color, colorConstraintLevel)
      ) {
        continue; // Try the other color assignment
      }

      // Choose pairing
      paired.add(p1.id);
      paired.add(p2.id);
      pairs.push({ p1, p2, whiteId, blackId });

      const result = solvePairings(players, index + 1, paired, pairs, colorConstraintLevel, avoidReplays);
      if (result !== null) {
        return result;
      }

      // Backtrack
      paired.delete(p1.id);
      paired.delete(p2.id);
      pairs.pop();
    }
  }

  return null;
}

export function generateSwissPairings(
  players: Player[],
  roundNumber: number,
  _pointsPerBye: number = 1
): Match[] {
  const activePlayers = players.filter((p) => p.active);

  // Sort active players: 
  // 1. By current Score descending
  // 2. By Rating descending
  // 3. By Name to ensure determinism
  const sortedPlayers = [...activePlayers].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ratingA = a.rating ?? 0;
    const ratingB = b.rating ?? 0;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return a.name.localeCompare(b.name);
  });

  const matches: Match[] = [];
  let byeMatch: Match | null = null;
  let playersToPair = [...sortedPlayers];

  // 1. Handle BYE if player count is odd
  if (playersToPair.length % 2 !== 0) {
    // Find the player with the lowest score who has NOT received a bye yet
    let byePlayerIdx = -1;
    for (let i = playersToPair.length - 1; i >= 0; i--) {
      if (!playersToPair[i].byeReceived) {
        byePlayerIdx = i;
        break;
      }
    }

    // Fallback if everyone already had a bye
    if (byePlayerIdx === -1) {
      byePlayerIdx = playersToPair.length - 1;
    }

    const byePlayer = playersToPair[byePlayerIdx];
    playersToPair.splice(byePlayerIdx, 1); // remove from pairing pool

    byeMatch = {
      id: `r${roundNumber}-bye-${byePlayer.id}`,
      round: roundNumber,
      player1Id: byePlayer.id,
      player2Id: null, // null means bye
      result: '1-0', // Win by default for the bye player
      status: 'completed',
    };
  }

  // 2. Pair matches
  let solvedPairs: PairWithColors[] | null = null;

  if (roundNumber === 1) {
    // ROUND 1: Direct split half pairing
    // 1st vs (N/2 + 1)th, 2nd vs (N/2 + 2)th...
    const N = playersToPair.length;
    const half = N / 2;
    solvedPairs = [];
    for (let i = 0; i < half; i++) {
      const p1 = playersToPair[i];
      const p2 = playersToPair[i + half];
      // Round 1 colors rule: alternating colors for top half
      if (i % 2 === 0) {
        solvedPairs.push({ p1, p2, whiteId: p1.id, blackId: p2.id });
      } else {
        solvedPairs.push({ p1, p2, whiteId: p2.id, blackId: p1.id });
      }
    }
  } else {
    // ROUND 2+: Backtracking pairings solver
    // Level 1: Strict color difference & Strict consecutive limit (max 2 consecutive same color)
    solvedPairs = solvePairings(playersToPair, 0, new Set(), [], 1, true);

    if (solvedPairs === null) {
      // Level 2: Relax color difference, but strictly forbid same color 3 times
      solvedPairs = solvePairings(playersToPair, 0, new Set(), [], 2, true);
    }

    if (solvedPairs === null) {
      // Level 3: Relax all color constraints to avoid replays
      solvedPairs = solvePairings(playersToPair, 0, new Set(), [], 3, true);
    }

    if (solvedPairs === null) {
      // Level 4: Relax replays (absolute emergency fallback)
      solvedPairs = solvePairings(playersToPair, 0, new Set(), [], 3, false);
    }
  }

  // 3. Generate matches using the resolved color assignments from the solver
  if (solvedPairs !== null) {
    solvedPairs.forEach((pair, idx) => {
      matches.push({
        id: `r${roundNumber}-m${idx + 1}`,
        round: roundNumber,
        player1Id: pair.whiteId,
        player2Id: pair.blackId,
        result: null,
        status: 'pending',
      });
    });
  } else {
    // Worst case fallback pairing (adjacent)
    for (let i = 0; i < playersToPair.length; i += 2) {
      if (i + 1 < playersToPair.length) {
        const p1 = playersToPair[i];
        const p2 = playersToPair[i + 1];
        const [whiteId, blackId] = determineColors(p1, p2);
        matches.push({
          id: `r${roundNumber}-m${(i / 2) + 1}`,
          round: roundNumber,
          player1Id: whiteId,
          player2Id: blackId,
          result: null,
          status: 'pending',
        });
      }
    }
  }

  if (byeMatch) {
    matches.push(byeMatch);
  }

  return matches;
}
