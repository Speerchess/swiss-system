import type { Player, Match } from './types';

// Helper to check if two players have played each other
export function havePlayed(p1: Player, p2Id: string): boolean {
  return p1.opponents.includes(p2Id);
}

// Helper to count color history
export function getColorStats(player: Player) {
  let whiteCount = 0;
  let blackCount = 0;
  let consecutiveSame = 0;
  let lastColor: 'W' | 'B' | null = null;

  for (let i = player.colors.length - 1; i >= 0; i--) {
    const col = player.colors[i];
    if (col === 'W') {
      whiteCount++;
      if (lastColor === null) {
        lastColor = 'W';
        consecutiveSame = 1;
      } else if (lastColor === 'W') {
        consecutiveSame++;
      } else {
        lastColor = 'W'; // stop counting consecutive once color changes
      }
    } else if (col === 'B') {
      blackCount++;
      if (lastColor === null) {
        lastColor = 'B';
        consecutiveSame = 1;
      } else if (lastColor === 'B') {
        consecutiveSame++;
      } else {
        lastColor = 'B'; // stop counting consecutive
      }
    }
  }

  const currentDiff = whiteCount - blackCount;
  return {
    whiteCount,
    blackCount,
    currentDiff,
    consecutiveSame,
    lastColor,
  };
}

// Determine who gets White (player1) and who gets Black (player2)
// Returns [whitePlayerId, blackPlayerId]
export function determineColors(p1: Player, p2: Player): [string, string] {
  const stats1 = getColorStats(p1);
  const stats2 = getColorStats(p2);

  // 1. If one player has a stronger preference due to color difference
  // We want to balance towards 0. So if p1 has +1 (more White) and p2 has 0, p2 should play White.
  // Preference is to play the color that reduces the absolute difference.
  // Preferred color for p1: diff > 0 -> B, diff < 0 -> W, diff == 0 -> neutral
  const pref1 = stats1.currentDiff > 0 ? 'B' : stats1.currentDiff < 0 ? 'W' : null;
  const pref2 = stats2.currentDiff > 0 ? 'B' : stats2.currentDiff < 0 ? 'W' : null;

  if (pref1 && !pref2) {
    return pref1 === 'W' ? [p1.id, p2.id] : [p2.id, p1.id];
  }
  if (!pref1 && pref2) {
    return pref2 === 'W' ? [p2.id, p1.id] : [p1.id, p2.id];
  }

  // If both have opposing preferences (e.g. p1 wants B, p2 wants W)
  if (pref1 && pref2 && pref1 !== pref2) {
    return pref1 === 'W' ? [p1.id, p2.id] : [p2.id, p1.id];
  }

  // If both have the same preference (e.g. both want White)
  if (pref1 && pref2 && pref1 === pref2) {
    // Give it to the one with the larger absolute difference
    if (Math.abs(stats1.currentDiff) > Math.abs(stats2.currentDiff)) {
      return pref1 === 'W' ? [p1.id, p2.id] : [p2.id, p1.id];
    } else if (Math.abs(stats1.currentDiff) < Math.abs(stats2.currentDiff)) {
      return pref1 === 'W' ? [p2.id, p1.id] : [p1.id, p2.id];
    }
  }

  // 2. If preferences are equal or neutral, check consecutive games
  if (stats1.lastColor && stats2.lastColor && stats1.lastColor !== stats2.lastColor) {
    // If p1 played W last, they want B. If p2 played B last, they want W.
    // This is a perfect match!
    if (stats1.lastColor === 'W') {
      return [p2.id, p1.id]; // p2 gets White, p1 gets Black
    } else {
      return [p1.id, p2.id]; // p1 gets White, p2 gets Black
    }
  }

  // If both played the same color last
  if (stats1.lastColor && stats1.lastColor === stats2.lastColor) {
    // Give the preferred opposite color to the one who has played it consecutively more times
    if (stats1.consecutiveSame > stats2.consecutiveSame) {
      return stats1.lastColor === 'W' ? [p2.id, p1.id] : [p1.id, p2.id];
    } else if (stats1.consecutiveSame < stats2.consecutiveSame) {
      return stats1.lastColor === 'W' ? [p1.id, p2.id] : [p2.id, p1.id];
    }
  }

  // 3. Fallback: Seed rating/rank or ID comparison to be deterministic
  // If ratings are available, higher rating gets White in odd rounds, Black in even rounds
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

  // Ultimate fallback: Lexicographical order of IDs
  return p1.id < p2.id ? [p1.id, p2.id] : [p2.id, p1.id];
}

// Check if color assignment is legal under standard Swiss rules (no same color 3 times, diff <= 2)
// Returns false if it violates rules and we want to enforce strictly.
export function isColorAssignmentLegal(
  player: Player,
  assignedColor: 'W' | 'B',
  strict: boolean = true
): boolean {
  if (!strict) return true;

  const stats = getColorStats(player);

  // Rule 1: No player can have a color difference absolute value > 2
  const newDiff = stats.currentDiff + (assignedColor === 'W' ? 1 : -1);
  if (Math.abs(newDiff) > 2) {
    return false;
  }

  // Rule 2: No player can play the same color 3 times in a row
  if (stats.consecutiveSame >= 2 && stats.lastColor === assignedColor) {
    return false;
  }

  return true;
}

// Backtracking solver to find a pairing for the list of players
// Returns list of player pairs (each pair is [p1, p2]) or null if no valid pairing
function solvePairings(
  players: Player[],
  index: number,
  paired: Set<string>,
  pairs: [Player, Player][],
  strictColors: boolean,
  avoidReplays: boolean
): [Player, Player][] | null {
  if (index >= players.length) {
    return [...pairs];
  }

  const p1 = players[index];
  if (paired.has(p1.id)) {
    return solvePairings(players, index + 1, paired, pairs, strictColors, avoidReplays);
  }

  // Try to pair p1 with some p2
  for (let i = index + 1; i < players.length; i++) {
    const p2 = players[i];
    if (paired.has(p2.id)) continue;

    // Check if they've played each other
    if (avoidReplays && havePlayed(p1, p2.id)) {
      continue;
    }

    // Determine colors and check legality
    const [whiteId] = determineColors(p1, p2);
    const p1Color = whiteId === p1.id ? 'W' : 'B';
    const p2Color = whiteId === p2.id ? 'W' : 'B';

    if (
      strictColors &&
      (!isColorAssignmentLegal(p1, p1Color, true) || !isColorAssignmentLegal(p2, p2Color, true))
    ) {
      continue;
    }

    // Choose this pairing and recurse
    paired.add(p1.id);
    paired.add(p2.id);
    pairs.push([p1, p2]);

    const result = solvePairings(players, index + 1, paired, pairs, strictColors, avoidReplays);
    if (result !== null) {
      return result;
    }

    // Backtrack
    paired.delete(p1.id);
    paired.delete(p2.id);
    pairs.pop();
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
  // 3. By Name (or ID) to ensure determinism
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
    // Since playersToPair is sorted by score desc, we search from the bottom (end of array)
    let byePlayerIdx = -1;
    for (let i = playersToPair.length - 1; i >= 0; i--) {
      if (!playersToPair[i].byeReceived) {
        byePlayerIdx = i;
        break;
      }
    }

    // Fallback if everyone already had a bye (rare, but possible in long tournaments)
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

  // 2. Try to find pairings
  // We try combinations:
  // Level 1: Strict colors, Avoid replays
  // Level 2: Relaxed colors, Avoid replays
  // Level 3: Relaxed colors, Allow replays (absolute emergency fallback)
  let solvedPairs: [Player, Player][] | null = null;

  solvedPairs = solvePairings(playersToPair, 0, new Set(), [], true, true);

  if (solvedPairs === null) {
    // Level 2: Relax colors
    solvedPairs = solvePairings(playersToPair, 0, new Set(), [], false, true);
  }

  if (solvedPairs === null) {
    // Level 3: Relax replays (should practically never happen unless number of players is very small and round number is high)
    solvedPairs = solvePairings(playersToPair, 0, new Set(), [], false, false);
  }

  if (solvedPairs !== null) {
    solvedPairs.forEach(([p1, p2], idx) => {
      const [whiteId, blackId] = determineColors(p1, p2);
      matches.push({
        id: `r${roundNumber}-m${idx + 1}`,
        round: roundNumber,
        player1Id: whiteId,
        player2Id: blackId,
        result: null,
        status: 'pending',
      });
    });
  } else {
    // Worst case fallback: just pair adjacent players from the sorted list
    // (This guarantees we produce matches even if backtracking fails completely)
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

  // If there was a bye, add it to the matches list
  if (byeMatch) {
    matches.push(byeMatch);
  }

  return matches;
}
