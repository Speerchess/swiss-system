import type { Player, Round, TiebreakType } from './types';

/**
 * Calculates tiebreaks for all players based on the tournament history (rounds and matches).
 */
export function calculateTiebreaks(
  players: Player[],
  rounds: Round[],
  settings: {
    pointsPerWin: number;
    pointsPerDraw: number;
    pointsPerLoss: number;
    pointsPerBye: number;
  }
): Player[] {
  // 1. Create a map of player ID to Player for easy access
  const playerMap = new Map<string, Player>(
    players.map((p) => [
      p.id,
      {
        ...p,
        // Reset temporary fields to recalculate
        score: 0,
        opponents: [],
        colors: [],
        byeReceived: false,
        tiebreaks: {
          buchholz: 0,
          medianBuchholz: 0,
          buchholzCut1: 0,
          sonnebornBerger: 0,
          cumulative: 0,
          directEncounter: 0,
          rating: p.rating ?? 0,
        },
      },
    ])
  );

  // 2. First pass: Recalculate scores, opponents, and colors from completed matches
  // Sort rounds by round number to calculate cumulative scores chronologically
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  
  // Track running score per round for cumulative score
  const runningScoresMap = new Map<string, number[]>();
  players.forEach((p) => runningScoresMap.set(p.id, []));

  for (const round of sortedRounds) {
    for (const match of round.matches) {
      if (match.status !== 'completed') continue;

      const p1 = playerMap.get(match.player1Id);
      const p2 = match.player2Id ? playerMap.get(match.player2Id) : null;

      // Handle Bye
      if (p2 === null && p1) {
        p1.score += settings.pointsPerBye;
        p1.colors.push('BYE');
        p1.byeReceived = true;
        
        const currentScore = p1.score;
        runningScoresMap.get(p1.id)?.push(currentScore);
        continue;
      }

      if (!p1 || !p2) continue;

      p1.opponents.push(p2.id);
      p2.opponents.push(p1.id);

      // player1Id is always White, player2Id is always Black
      p1.colors.push('W');
      p2.colors.push('B');

      if (match.result === '1-0') {
        p1.score += settings.pointsPerWin;
        p2.score += settings.pointsPerLoss;
      } else if (match.result === '0-1') {
        p1.score += settings.pointsPerLoss;
        p2.score += settings.pointsPerWin;
      } else if (match.result === '1/2-1/2') {
        p1.score += settings.pointsPerDraw;
        p2.score += settings.pointsPerDraw;
      } else if (match.result === '0-0') {
        p1.score += settings.pointsPerLoss;
        p2.score += settings.pointsPerLoss;
      }

      runningScoresMap.get(p1.id)?.push(p1.score);
      runningScoresMap.get(p2.id)?.push(p2.score);
    }

    // For any active player who did NOT have a match recorded in this round,
    // their score stays the same. We record their cumulative score.
    playerMap.forEach((p) => {
      const runningScores = runningScoresMap.get(p.id) || [];
      if (runningScores.length < round.roundNumber) {
        runningScores.push(p.score);
      }
    });
  }

  // 3. Second pass: Calculate opponent-based tiebreaks (Buchholz, SB, etc.)
  playerMap.forEach((player) => {
    let buchholzSum = 0;
    let sbSum = 0;
    const opponentScores: number[] = [];

    // We need to look at matches this player played to calculate Sonneborn-Berger
    // and find their opponents' actual scores.
    player.opponents.forEach((oppId) => {
      const opponent = playerMap.get(oppId);
      if (!opponent) return;

      const oppScore = opponent.score;
      buchholzSum += oppScore;
      opponentScores.push(oppScore);
    });

    // Sonneborn-Berger
    // Walk through all completed matches to check results for this player
    for (const round of sortedRounds) {
      for (const match of round.matches) {
        if (match.status !== 'completed') continue;

        if (match.player1Id === player.id && match.player2Id) {
          const opponent = playerMap.get(match.player2Id);
          if (opponent) {
            if (match.result === '1-0') {
              sbSum += opponent.score;
            } else if (match.result === '1/2-1/2') {
              sbSum += opponent.score * 0.5;
            }
          }
        } else if (match.player2Id === player.id) {
          const opponent = playerMap.get(match.player1Id);
          if (opponent) {
            if (match.result === '0-1') {
              sbSum += opponent.score;
            } else if (match.result === '1/2-1/2') {
              sbSum += opponent.score * 0.5;
            }
          }
        }
      }
    }

    // Median Buchholz (exclude highest and lowest)
    let medianBuchholz = buchholzSum;
    if (opponentScores.length >= 3) {
      const sortedOppScores = [...opponentScores].sort((a, b) => a - b);
      sortedOppScores.pop(); // remove highest
      sortedOppScores.shift(); // remove lowest
      medianBuchholz = sortedOppScores.reduce((sum, score) => sum + score, 0);
    }

    // Buchholz Cut 1 (exclude lowest)
    let buchholzCut1 = buchholzSum;
    if (opponentScores.length >= 2) {
      const sortedOppScores = [...opponentScores].sort((a, b) => a - b);
      sortedOppScores.shift(); // remove lowest opponent score
      buchholzCut1 = sortedOppScores.reduce((sum, score) => sum + score, 0);
    }

    // Cumulative Score
    const runningScores = runningScoresMap.get(player.id) || [];
    const cumulativeScore = runningScores.reduce((sum, score) => sum + score, 0);

    // Direct Encounter (Head-to-head score against players with the same score)
    let dePoints = 0;
    const tiedPlayerIds = Array.from(playerMap.values())
      .filter((p) => p.id !== player.id && p.score === player.score)
      .map((p) => p.id);

    if (tiedPlayerIds.length > 0) {
      for (const round of sortedRounds) {
        for (const match of round.matches) {
          if (match.status !== 'completed') continue;

          if (match.player1Id === player.id && tiedPlayerIds.includes(match.player2Id || '')) {
            if (match.result === '1-0') {
              dePoints += 1.0;
            } else if (match.result === '1/2-1/2') {
              dePoints += 0.5;
            }
          } else if (match.player2Id === player.id && tiedPlayerIds.includes(match.player1Id)) {
            if (match.result === '0-1') {
              dePoints += 1.0;
            } else if (match.result === '1/2-1/2') {
              dePoints += 0.5;
            }
          }
        }
      }
    }

    // Update tiebreaks object
    player.tiebreaks = {
      buchholz: buchholzSum,
      medianBuchholz,
      buchholzCut1,
      sonnebornBerger: sbSum,
      cumulative: cumulativeScore,
      directEncounter: dePoints,
      rating: player.rating ?? 0,
    };
  });

  return Array.from(playerMap.values());
}

function getTiebreakValue(player: Player, criteria: TiebreakType): number {
  switch (criteria) {
    case 'buchholz':
      return player.tiebreaks.buchholz;
    case 'median-buchholz':
      return player.tiebreaks.medianBuchholz;
    case 'buchholz-cut1':
      return player.tiebreaks.buchholzCut1;
    case 'sonneborn-berger':
      return player.tiebreaks.sonnebornBerger;
    case 'cumulative':
      return player.tiebreaks.cumulative;
    case 'direct-encounter':
      return player.tiebreaks.directEncounter;
    case 'rating':
      return player.tiebreaks.rating;
    default:
      return 0;
  }
}

/**
 * Comparator to sort players based on tournament score and ordered tiebreak criteria.
 * Returns negative if 'a' should rank higher than 'b', positive if 'b' should rank higher.
 */
export function comparePlayers(
  a: Player,
  b: Player,
  tiebreakOrder: TiebreakType[],
  rounds: Round[]
): number {
  // 1. Primary sort: Score (higher is better)
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  // 2. Secondary sort: Walk through tiebreak criteria in user's preferred order
  for (const criteria of tiebreakOrder) {
    if (criteria === 'direct-encounter') {
      // Find head-to-head match between a and b
      let h2hResult = 0;
      for (const round of rounds) {
        for (const match of round.matches) {
          if (match.status !== 'completed') continue;
          if (
            (match.player1Id === a.id && match.player2Id === b.id) ||
            (match.player1Id === b.id && match.player2Id === a.id)
          ) {
            const aIsP1 = match.player1Id === a.id;
            if (match.result === '1-0') {
              h2hResult = aIsP1 ? -1 : 1; // negative means 'a' is better (higher rank)
            } else if (match.result === '0-1') {
              h2hResult = aIsP1 ? 1 : -1;
            }
            break;
          }
        }
        if (h2hResult !== 0) break;
      }
      if (h2hResult !== 0) return h2hResult;
    } else {
      const valA = getTiebreakValue(a, criteria);
      const valB = getTiebreakValue(b, criteria);
      if (valB !== valA) {
        return valB - valA; // higher tiebreak value is better
      }
    }
  }

  // 3. Tertiary sort: Rating (higher is better)
  const ratingA = a.rating ?? 0;
  const ratingB = b.rating ?? 0;
  if (ratingB !== ratingA) {
    return ratingB - ratingA;
  }

  // 4. Quaternary sort: Deterministic alphabetical order
  return a.name.localeCompare(b.name);
}
