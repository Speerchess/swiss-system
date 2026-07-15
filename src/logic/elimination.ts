import type { Player, Match, Round } from './types';

export interface PlayerSource {
  type: 'seed' | 'match_winner' | 'match_loser';
  id: string; // matchId or seed index (e.g. "seed-1")
}

export interface MatchWithSources extends Match {
  p1Source?: PlayerSource;
  p2Source?: PlayerSource;
}

// Generate standard tournament seeding order (e.g. 1, 8, 5, 4, 3, 6, 7, 2)
export function getSeedingOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const nextOrder: number[] = [];
    const target = order.length * 2 + 1;
    for (const seed of order) {
      nextOrder.push(seed);
      nextOrder.push(target - seed);
    }
    order = nextOrder;
  }
  return order;
}

// Helper to find the next power of 2
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) {
    p *= 2;
  }
  return p;
}

/**
 * Propagates results through matches in all rounds based on their source matches.
 * If a match's sources are completed, it fills in the player IDs.
 * If a match becomes a bye (only one player exists), it auto-completes.
 */
export function propagateEliminationResults(
  rounds: Round[],
  players: Player[]
): Round[] {
  // Deep clone rounds to avoid mutating state directly
  const newRounds: Round[] = JSON.parse(JSON.stringify(rounds));

  // Helper to find a match by ID in the cloned rounds
  function findMatch(matchId: string): MatchWithSources | null {
    for (const r of newRounds) {
      for (const m of r.matches) {
        if (m.id === matchId) return m as MatchWithSources;
      }
    }
    return null;
  }

  // Helper to get player ID from a source
  function getPlayerFromSource(source: PlayerSource | undefined): {
    playerId: string | null;
    isBye: boolean;
    isReady: boolean;
  } {
    if (!source) return { playerId: null, isBye: true, isReady: true };

    if (source.type === 'seed') {
      const seedIndex = parseInt(source.id.split('-')[1], 10);
      // Players are sorted by rating/seed
      const player = players[seedIndex];
      return {
        playerId: player ? player.id : null,
        isBye: !player,
        isReady: true,
      };
    }

    const sourceMatch = findMatch(source.id);
    if (!sourceMatch) {
      return { playerId: null, isBye: false, isReady: false };
    }

    if (sourceMatch.status !== 'completed') {
      return { playerId: null, isBye: false, isReady: false };
    }

    // Determine who won/lost the source match
    let winnerId: string | null = null;
    let loserId: string | null = null;

    if (sourceMatch.player2Id === null) {
      // Bye
      winnerId = sourceMatch.player1Id;
      loserId = null;
    } else {
      if (sourceMatch.result === '1-0') {
        winnerId = sourceMatch.player1Id;
        loserId = sourceMatch.player2Id;
      } else if (sourceMatch.result === '0-1') {
        winnerId = sourceMatch.player2Id;
        loserId = sourceMatch.player1Id;
      } else {
        // Draw or invalid result in elimination - we shouldn't have draws in elimination,
        // but if it happens, player 1 advances by default or we treat it as pending
        winnerId = sourceMatch.player1Id;
        loserId = sourceMatch.player2Id;
      }
    }

    if (source.type === 'match_winner') {
      return {
        playerId: winnerId,
        isBye: winnerId === null,
        isReady: true,
      };
    } else {
      return {
        playerId: loserId,
        isBye: loserId === null,
        isReady: true,
      };
    }
  }

  let changesMade = true;
  let iterations = 0;
  const maxIterations = 50; // prevent infinite loops

  while (changesMade && iterations < maxIterations) {
    changesMade = false;
    iterations++;

    for (const r of newRounds) {
      for (const m of r.matches as MatchWithSources[]) {
        // Skip Grand Final Reset if Grand Final didn't require it
        if (m.bracketType === 'grand_final_reset') {
          const gfMatch = findMatch(m.id.replace('-reset', ''));
          if (gfMatch && gfMatch.status === 'completed') {
            // In double elimination: Winner of Losers (player2) must beat Winner of Winners (player1)
            // to trigger reset. If Winner of Winners won (result === '1-0'), no reset match is played.
            if (gfMatch.result === '1-0') {
              if (m.status !== 'completed' || m.result !== '0-0') {
                m.status = 'completed';
                m.result = '0-0'; // Dummy result: not played
                m.player1Id = '';
                m.player2Id = null;
                changesMade = true;
              }
              continue;
            }
          }
        }

        // Check player 1 source
        if (m.p1Source) {
          const p1Res = getPlayerFromSource(m.p1Source);
          if (p1Res.isReady && m.player1Id !== p1Res.playerId) {
            m.player1Id = p1Res.playerId || '';
            changesMade = true;
          }
        }

        // Check player 2 source
        if (m.p2Source) {
          const p2Res = getPlayerFromSource(m.p2Source);
          if (p2Res.isReady && m.player2Id !== p2Res.playerId) {
            m.player2Id = p2Res.playerId;
            changesMade = true;
          }
        } else if (m.player2Id !== null) {
          // If no source, player 2 is a bye
          m.player2Id = null;
          changesMade = true;
        }

        // Auto-resolve matches with byes - but ONLY when both sources are fully resolved.
        // Without this check, 'player2Id === null' (default) is mistaken for a bye
        // when the source match simply hasn't been played yet, causing cascading auto-completions.
        if (m.status === 'pending') {
          const mSources = m as MatchWithSources;
          const p1SourceReady = !mSources.p1Source || getPlayerFromSource(mSources.p1Source).isReady;
          const p2SourceReady = !mSources.p2Source || getPlayerFromSource(mSources.p2Source).isReady;

          // Only auto-resolve if both sides have been determined
          if (p1SourceReady && p2SourceReady) {
            const p1IsEmpty = !m.player1Id;
            const p2IsEmpty = m.player2Id === null;

            if (p1IsEmpty && p2IsEmpty) {
              // Both empty: double bye, skip
            } else if (p1IsEmpty && !p2IsEmpty) {
              // Player 1 is empty (bye), Player 2 is real -> Player 2 wins by bye
              m.result = '0-1';
              m.status = 'completed';
              changesMade = true;
            } else if (!p1IsEmpty && p2IsEmpty) {
              // Player 1 is real, Player 2 is empty (bye) -> Player 1 wins by bye
              m.result = '1-0';
              m.status = 'completed';
              changesMade = true;
            }
          }
        }
      }
    }
  }

  // Mark rounds as completed if all matches in them are completed
  for (const r of newRounds) {
    r.isCompleted = r.matches.every((m) => m.status === 'completed');
  }

  return newRounds;
}

// ==========================================
// 1. SINGLE ELIMINATION GENERATOR
// ==========================================
export function generateSingleElimination(players: Player[]): Round[] {
  const sortedPlayers = [...players].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const numPlayers = sortedPlayers.length;
  const P = nextPowerOfTwo(numPlayers); // Seeding count (e.g. 8 for 6 players)
  const seedingOrder = getSeedingOrder(P);

  const rounds: Round[] = [];
  const numRounds = Math.log2(P);

  // Round 1
  const r1Matches: MatchWithSources[] = [];
  const matchesInRound1 = P / 2;

  for (let i = 0; i < matchesInRound1; i++) {
    const seed1 = seedingOrder[i * 2];
    const seed2 = seedingOrder[i * 2 + 1];

    const matchId = `se-r1-m${i + 1}`;
    r1Matches.push({
      id: matchId,
      round: 1,
      player1Id: '',
      player2Id: null,
      result: null,
      status: 'pending',
      bracketType: 'winners',
      p1Source: { type: 'seed', id: `seed-${seed1 - 1}` },
      p2Source: { type: 'seed', id: `seed-${seed2 - 1}` },
    });
  }

  rounds.push({
    roundNumber: 1,
    matches: r1Matches,
    isCompleted: false,
  });

  // Subsequent rounds
  for (let r = 2; r <= numRounds; r++) {
    const matchesInRound = P / Math.pow(2, r);
    const roundMatches: MatchWithSources[] = [];

    for (let i = 0; i < matchesInRound; i++) {
      const prevMatchId1 = `se-r${r - 1}-m${i * 2 + 1}`;
      const prevMatchId2 = `se-r${r - 1}-m${i * 2 + 2}`;

      roundMatches.push({
        id: `se-r${r}-m${i + 1}`,
        round: r,
        player1Id: '',
        player2Id: null,
        result: null,
        status: 'pending',
        bracketType: 'winners',
        p1Source: { type: 'match_winner', id: prevMatchId1 },
        p2Source: { type: 'match_winner', id: prevMatchId2 },
      });
    }

    rounds.push({
      roundNumber: r,
      matches: roundMatches,
      isCompleted: false,
    });
  }

  // Initial propagation to handle seeds & byes in Round 1
  return propagateEliminationResults(rounds, sortedPlayers);
}

// ==========================================
// 2. DOUBLE ELIMINATION GENERATOR
// ==========================================
export function generateDoubleElimination(players: Player[]): Round[] {
  const sortedPlayers = [...players].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const numPlayers = sortedPlayers.length;
  const P = nextPowerOfTwo(numPlayers);
  const seedingOrder = getSeedingOrder(P);

  const rounds: Round[] = [];
  
  // We'll organize rounds dynamically. Let's group all Winners and Losers matches
  // by round numbers. To keep things clean, we will have:
  // Round 1: WR1 (Winners Round 1)
  // Round 2: WR2 + LR1 (Losers Round 1 - minor)
  // Round 3: LR2 (Losers Round 2 - major)
  // Round 4: WR3 + LR3 (Losers Round 3 - minor)
  // Round 5: LR4 (Losers Round 4 - major)
  // ... and so on.
  
  // Let's first pre-generate all match nodes in Winners Bracket
  const numWinnersRounds = Math.log2(P);
  const winnersMatchesMap = new Map<string, MatchWithSources>();

  // Winners Round 1
  const wr1Matches: MatchWithSources[] = [];
  for (let i = 0; i < P / 2; i++) {
    const matchId = `de-w-r1-m${i + 1}`;
    const m: MatchWithSources = {
      id: matchId,
      round: 1,
      player1Id: '',
      player2Id: null,
      result: null,
      status: 'pending',
      bracketType: 'winners',
      p1Source: { type: 'seed', id: `seed-${seedingOrder[i * 2] - 1}` },
      p2Source: { type: 'seed', id: `seed-${seedingOrder[i * 2 + 1] - 1}` },
    };
    wr1Matches.push(m);
    winnersMatchesMap.set(matchId, m);
  }
  
  // Winners Rounds 2 to log2(P)
  const winnersRoundsMatches: MatchWithSources[][] = [wr1Matches];
  for (let r = 2; r <= numWinnersRounds; r++) {
    const count = P / Math.pow(2, r);
    const wrMatches: MatchWithSources[] = [];
    for (let i = 0; i < count; i++) {
      const matchId = `de-w-r${r}-m${i + 1}`;
      const m: MatchWithSources = {
        id: matchId,
        round: r,
        player1Id: '',
        player2Id: null,
        result: null,
        status: 'pending',
        bracketType: 'winners',
        p1Source: { type: 'match_winner', id: `de-w-r${r - 1}-m${i * 2 + 1}` },
        p2Source: { type: 'match_winner', id: `de-w-r${r - 1}-m${i * 2 + 2}` },
      };
      wrMatches.push(m);
      winnersMatchesMap.set(matchId, m);
    }
    winnersRoundsMatches.push(wrMatches);
  }

  // Pre-generate all match nodes in Losers Bracket
  // Losers Round 1 (LR1, minor): Pairs losers of WR1. Count = P/4.
  const losersMatchesMap = new Map<string, MatchWithSources>();
  const lr1Matches: MatchWithSources[] = [];
  for (let i = 0; i < P / 4; i++) {
    const matchId = `de-l-r1-m${i + 1}`;
    const m: MatchWithSources = {
      id: matchId,
      round: 1,
      player1Id: '',
      player2Id: null,
      result: null,
      status: 'pending',
      bracketType: 'losers',
      p1Source: { type: 'match_loser', id: `de-w-r1-m${i * 2 + 1}` },
      p2Source: { type: 'match_loser', id: `de-w-r1-m${i * 2 + 2}` },
    };
    lr1Matches.push(m);
    losersMatchesMap.set(matchId, m);
  }

  const losersRoundsMatches: MatchWithSources[][] = [lr1Matches];
  
  // Subsequent losers rounds.
  // There are (numWinnersRounds - 1) * 2 losers rounds.
  // E.g. for P=8: numWinnersRounds = 3. Losers rounds = 4: LR1, LR2, LR3, LR4.
  // LR1 (minor): P/4 matches (from WR1 losers).
  // LR2 (major): P/4 matches (from LR1 winners vs WR2 losers).
  // LR3 (minor): P/8 matches (from LR2 winners).
  // LR4 (major): P/8 matches (from LR3 winners vs WR3 losers).
  // Let's generate this programmatically:
  for (let wr = 2; wr <= numWinnersRounds; wr++) {
    const matchCount = P / Math.pow(2, wr); // P/4 for wr=2, P/8 for wr=3...

    // 1. Major Losers Round (LR(2wr - 2)): LR2, LR4, LR6...
    // Input 1: Winners of LR(2wr - 3) [previous losers round]
    // Input 2: Losers of WR(wr)
    const lrMajorRoundNum = (wr - 1) * 2;
    const lrMajorMatches: MatchWithSources[] = [];
    
    for (let i = 0; i < matchCount; i++) {
      const matchId = `de-l-r${lrMajorRoundNum}-m${i + 1}`;
      
      // Standard seeding cross matching to avoid immediate rematches
      // Winners of LR(2wr-3) match i vs Losers of WR(wr) match (matchCount - 1 - i)
      const prevLrId = `de-l-r${lrMajorRoundNum - 1}-m${i + 1}`;
      const wrLoserId = `de-w-r${wr}-m${matchCount - i}`; // cross matching

      const m: MatchWithSources = {
        id: matchId,
        round: lrMajorRoundNum,
        player1Id: '',
        player2Id: null,
        result: null,
        status: 'pending',
        bracketType: 'losers',
        p1Source: { type: 'match_winner', id: prevLrId },
        p2Source: { type: 'match_loser', id: wrLoserId },
      };
      lrMajorMatches.push(m);
      losersMatchesMap.set(matchId, m);
    }
    losersRoundsMatches.push(lrMajorMatches);

    // 2. Minor Losers Round (LR(2wr - 1)): LR3, LR5, LR7...
    // Input: Winners of LR(2wr - 2) playing each other. Count = matchCount / 2.
    // Only generate if matchCount > 1
    if (matchCount > 1) {
      const lrMinorRoundNum = (wr - 1) * 2 + 1;
      const lrMinorMatches: MatchWithSources[] = [];
      for (let i = 0; i < matchCount / 2; i++) {
        const matchId = `de-l-r${lrMinorRoundNum}-m${i + 1}`;
        const m: MatchWithSources = {
          id: matchId,
          round: lrMinorRoundNum,
          player1Id: '',
          player2Id: null,
          result: null,
          status: 'pending',
          bracketType: 'losers',
          p1Source: { type: 'match_winner', id: `de-l-r${lrMinorRoundNum - 1}-m${i * 2 + 1}` },
          p2Source: { type: 'match_winner', id: `de-l-r${lrMinorRoundNum - 1}-m${i * 2 + 2}` },
        };
        lrMinorMatches.push(m);
        losersMatchesMap.set(matchId, m);
      }
      losersRoundsMatches.push(lrMinorMatches);
    }
  }

  // Grand Finals
  // Winner of Winners Finals (WR(numWinnersRounds)) vs Winner of Losers Finals (LR(final_losers_round))
  const finalLosersRoundNum = (numWinnersRounds - 1) * 2;
  const gfMatchId = `de-gf`;
  const gfMatch: MatchWithSources = {
    id: gfMatchId,
    round: numWinnersRounds + 1, // GF round
    player1Id: '',
    player2Id: null,
    result: null,
    status: 'pending',
    bracketType: 'grand_final',
    p1Source: { type: 'match_winner', id: `de-w-r${numWinnersRounds}-m1` },
    p2Source: { type: 'match_winner', id: `de-l-r${finalLosersRoundNum}-m1` },
  };

  // Grand Finals Reset (if Losers Winner wins GF Match)
  const gfrMatchId = `de-gf-reset`;
  const gfrMatch: MatchWithSources = {
    id: gfrMatchId,
    round: numWinnersRounds + 2,
    player1Id: '',
    player2Id: null,
    result: null,
    status: 'pending',
    bracketType: 'grand_final_reset',
    p1Source: { type: 'match_winner', id: gfMatchId }, // Winner of GF (player 1)
    p2Source: { type: 'match_loser', id: gfMatchId },  // Loser of GF (player 2)
  };

  // Organize matches into sequential UI Rounds:
  // Round 1: Winners Round 1
  rounds.push({
    roundNumber: 1,
    matches: wr1Matches,
    isCompleted: false,
  });

  // Winners Round r starts at round (r + r - 1) = 2r - 1?
  // Let's structure the UI rounds logically so matches that can be played in parallel are in the same round:
  // UI Round 1: WR1
  // UI Round 2: WR2, LR1
  // UI Round 3: LR2 (Major)
  // UI Round 4: WR3, LR3 (Minor)
  // UI Round 5: LR4 (Major)
  // ...
  // UI Round (2r - 2): WR(r), LR(2r - 3) (Minor)
  // UI Round (2r - 1): LR(2r - 2) (Major)
  // This is a standard Double Elimination round flow!
  
  // Winners Round 1 is UI Round 1.
  // For each Winners Round r from 2 to numWinnersRounds:
  // - UI Round (2r - 2) contains: Winners Round r, Losers Round (2r - 3)
  // - UI Round (2r - 1) contains: Losers Round (2r - 2)
  for (let r = 2; r <= numWinnersRounds; r++) {
    const uiRoundA = (r - 1) * 2; // UI Round 2, 4, 6...
    const uiRoundB = (r - 1) * 2 + 1; // UI Round 3, 5, 7...

    const wrMatches = winnersRoundsMatches[r - 1] || [];
    const lrMinorMatches = losersRoundsMatches[(r - 1) * 2 - 2] || []; // LR1 (index 0) for r=2, LR3 (index 2) for r=3
    const lrMajorMatches = losersRoundsMatches[(r - 1) * 2 - 1] || []; // LR2 (index 1) for r=2, LR4 (index 3) for r=3

    rounds.push({
      roundNumber: uiRoundA,
      matches: [...wrMatches, ...lrMinorMatches],
      isCompleted: false,
    });

    rounds.push({
      roundNumber: uiRoundB,
      matches: lrMajorMatches,
      isCompleted: false,
    });
  }

  // Grand Finals UI Round
  const gfUiRound = numWinnersRounds * 2;
  rounds.push({
    roundNumber: gfUiRound,
    matches: [gfMatch],
    isCompleted: false,
  });

  // Grand Finals Reset UI Round
  rounds.push({
    roundNumber: gfUiRound + 1,
    matches: [gfrMatch],
    isCompleted: false,
  });

  // Propagate seeds and initial byes
  return propagateEliminationResults(rounds, sortedPlayers);
}

// ==========================================
// 3. TRIPLE ELIMINATION GENERATOR
// ==========================================
export function generateTripleElimination(players: Player[]): Round[] {
  const sortedPlayers = [...players].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const numPlayers = sortedPlayers.length;
  const P = nextPowerOfTwo(numPlayers);
  const seedingOrder = getSeedingOrder(P);

  const rounds: Round[] = [];

  // Triple elimination has:
  // A-bracket (Winners): single elimination. Losers go to B-bracket.
  // B-bracket (1 loss): single elimination. Losers go to C-bracket.
  // C-bracket (2 losses): single elimination. Losers are eliminated.
  // For the final, we will have a final bracket:
  // - Match 1 (Semifinals): Winner of B plays Winner of C.
  // - Match 2 (Grand Finals): Winner of A plays Winner of Match 1.
  // This is a clean, structured tournament.
  // Let's generate this DAG!

  const numRounds = Math.log2(P);

  // --- A-Bracket (Winners) ---
  const aMatches: MatchWithSources[][] = [];
  for (let r = 1; r <= numRounds; r++) {
    const count = P / Math.pow(2, r);
    const roundMatches: MatchWithSources[] = [];
    for (let i = 0; i < count; i++) {
      const matchId = `te-a-r${r}-m${i + 1}`;
      const m: MatchWithSources = {
        id: matchId,
        round: r,
        player1Id: '',
        player2Id: null,
        result: null,
        status: 'pending',
        bracketType: 'winners',
      };
      if (r === 1) {
        m.p1Source = { type: 'seed', id: `seed-${seedingOrder[i * 2] - 1}` };
        m.p2Source = { type: 'seed', id: `seed-${seedingOrder[i * 2 + 1] - 1}` };
      } else {
        m.p1Source = { type: 'match_winner', id: `te-a-r${r - 1}-m${i * 2 + 1}` };
        m.p2Source = { type: 'match_winner', id: `te-a-r${r - 1}-m${i * 2 + 2}` };
      }
      roundMatches.push(m);
    }
    aMatches.push(roundMatches);
  }

  // --- B-Bracket (1 Loss) ---
  // Losers of A-bracket go to B-bracket.
  // B-bracket round 1 (BR1): Losers of A Round 1. Count = P/4.
  const bMatches: MatchWithSources[][] = [];
  const br1Matches: MatchWithSources[] = [];
  for (let i = 0; i < P / 4; i++) {
    br1Matches.push({
      id: `te-b-r1-m${i + 1}`,
      round: 1,
      player1Id: '',
      player2Id: null,
      result: null,
      status: 'pending',
      bracketType: 'losers',
      p1Source: { type: 'match_loser', id: `te-a-r1-m${i * 2 + 1}` },
      p2Source: { type: 'match_loser', id: `te-a-r1-m${i * 2 + 2}` },
    });
  }
  bMatches.push(br1Matches);

  // Subsequent B-bracket rounds:
  // For each round from 2 to numRounds:
  // - B Major Round (B_2r-2): winners of B Minor vs losers of A Round r.
  // - B Minor Round (B_2r-1): winners of B Major play each other.
  for (let ar = 2; ar <= numRounds; ar++) {
    const matchCount = P / Math.pow(2, ar); // P/4 for ar=2, P/8 for ar=3...
    const bMajorRoundNum = (ar - 1) * 2;
    const bMajorMatches: MatchWithSources[] = [];

    for (let i = 0; i < matchCount; i++) {
      const matchId = `te-b-r${bMajorRoundNum}-m${i + 1}`;
      bMajorMatches.push({
        id: matchId,
        round: bMajorRoundNum,
        player1Id: '',
        player2Id: null,
        result: null,
        status: 'pending',
        bracketType: 'losers',
        p1Source: { type: 'match_winner', id: `te-b-r${bMajorRoundNum - 1}-m${i + 1}` },
        p2Source: { type: 'match_loser', id: `te-a-r${ar}-m${matchCount - i}` }, // cross match
      });
    }
    bMatches.push(bMajorMatches);

    if (matchCount > 1) {
      const bMinorRoundNum = (ar - 1) * 2 + 1;
      const bMinorMatches: MatchWithSources[] = [];
      for (let i = 0; i < matchCount / 2; i++) {
        bMinorMatches.push({
          id: `te-b-r${bMinorRoundNum}-m${i + 1}`,
          round: bMinorRoundNum,
          player1Id: '',
          player2Id: null,
          result: null,
          status: 'pending',
          bracketType: 'losers',
          p1Source: { type: 'match_winner', id: `te-b-r${bMinorRoundNum - 1}-m${i * 2 + 1}` },
          p2Source: { type: 'match_winner', id: `te-b-r${bMinorRoundNum - 1}-m${i * 2 + 2}` },
        });
      }
      bMatches.push(bMinorMatches);
    }
  }

  // --- C-Bracket (2 Losses) ---
  // Losers of B-bracket go to C-bracket.
  // C-bracket Round 1 (CR1): Losers of B Round 1 (BR1). Count = P/8.
  const cMatches: MatchWithSources[][] = [];
  const cr1Matches: MatchWithSources[] = [];
  for (let i = 0; i < P / 8; i++) {
    cr1Matches.push({
      id: `te-c-r1-m${i + 1}`,
      round: 1,
      player1Id: '',
      player2Id: null,
      result: null,
      status: 'pending',
      bracketType: 'c_bracket',
      p1Source: { type: 'match_loser', id: `te-b-r1-m${i * 2 + 1}` },
      p2Source: { type: 'match_loser', id: `te-b-r1-m${i * 2 + 2}` },
    });
  }
  if (cr1Matches.length > 0) {
    cMatches.push(cr1Matches);
  }

  // C-bracket subsequent rounds:
  // For each B round from 2 to final B round:
  // - C Major Round: winners of C Minor vs losers of B Round r.
  // - C Minor Round: winners of C Major play each other.
  const finalBRoundNum = (numRounds - 1) * 2;
  for (let br = 2; br <= finalBRoundNum; br++) {
    // A B-round has some number of matches. Losers drop to C-bracket.
    // Let's count B-round matches:
    // B-bracket matches at index br-1 in bMatches:
    const bRoundMatches = bMatches[br - 1] || [];
    const count = bRoundMatches.length;

    // Major round in C: Winners of previous C round vs Losers of B Round br.
    // In C, we only have minor/major if we have enough players.
    // Let's implement a simple C bracket progression:
    // CR(2br-2) is Major C Round: Winner of CR(2br-3) vs Loser of BR(br).
    // Let's build this:
    const cMajorRoundNum = (br - 1) * 2;
    const cMajorMatches: MatchWithSources[] = [];

    // Check if we have a previous C round
    const prevCRoundIdx = cMajorRoundNum - 2; // index in cMatches
    const prevCMatches = cMatches[prevCRoundIdx] || [];

    // We can only pair if there's someone in C and someone dropping from B
    if (prevCMatches.length > 0 && count > 0) {
      for (let i = 0; i < count; i++) {
        // Find previous C match winner
        const prevCId = `te-c-r${cMajorRoundNum - 1}-m${i + 1}`;
        const bLoserId = `te-b-r${br}-m${count - i}`; // cross match

        cMajorMatches.push({
          id: `te-c-r${cMajorRoundNum}-m${i + 1}`,
          round: cMajorRoundNum,
          player1Id: '',
          player2Id: null,
          result: null,
          status: 'pending',
          bracketType: 'c_bracket',
          p1Source: { type: 'match_winner', id: prevCId },
          p2Source: { type: 'match_loser', id: bLoserId },
        });
      }
      cMatches.push(cMajorMatches);

      if (count > 1) {
        const cMinorRoundNum = (br - 1) * 2 + 1;
        const cMinorMatches: MatchWithSources[] = [];
        for (let i = 0; i < count / 2; i++) {
          cMinorMatches.push({
            id: `te-c-r${cMinorRoundNum}-m${i + 1}`,
            round: cMinorRoundNum,
            player1Id: '',
            player2Id: null,
            result: null,
            status: 'pending',
            bracketType: 'c_bracket',
            p1Source: { type: 'match_winner', id: `te-c-r${cMinorRoundNum - 1}-m${i * 2 + 1}` },
            p2Source: { type: 'match_winner', id: `te-c-r${cMinorRoundNum - 1}-m${i * 2 + 2}` },
          });
        }
        cMatches.push(cMinorMatches);
      }
    } else if (count > 0 && prevCMatches.length === 0) {
      // If C was empty but B matches are finishing (e.g. for P=4, BR1 has 1 match, CR1 has 0 matches, but BR2 losers drop to CR2)
      // Here, BR1 losers drop to B-finals, loser of B-finals drops to C.
      // Let's handle: if there's no previous C round, the losers of B round can play each other directly to start C!
      // This is exactly what happens in small tournaments.
      // E.g. for P=4:
      // A-bracket: 2 rounds (WR1: 2 matches, WR2: 1 match).
      // B-bracket: BR1 has 1 match (losers of WR1). BR2 (major) has 1 match (winner of BR1 vs loser of WR2).
      // BR2 is the B-finals. The loser of BR2 has 2 losses, so they drop to C.
      // Since they are the only player with 2 losses, they wait in C for the B-finals winner?
      // Wait, A-winner, B-winner, and C-winner.
      // For P=4, B-winner is winner of BR2. C-winner is loser of BR2 (since they lost in B-bracket but have only 2 losses total!).
      // So Winner of A, Winner of B, and Loser of B (which is C-winner) play the finals!
      // This is extremely simple and works automatically!
    }
  }

  // --- FINALS STAGE ---
  // We need the A Winner, B Winner, and C Winner.
  // 1. A Winner is Winner of `te-a-r${numRounds}-m1`.
  // 2. B Winner:
  //    - If P >= 4: Winner of B-finals, which is `te-b-r${finalBRoundNum}-m1`.
  //    - If P = 2: Winner of BR1, which is `te-b-r1-m1`? Actually, for P=2, B has only 1 player who lost in WR1.
  // 3. C Winner:
  //    - If P >= 8: Winner of C-finals, which is `te-c-r${(finalBRoundNum - 1) * 2}-m1`?
  //      Actually, it's the winner of the very last match in cMatches.
  //    - If P = 4: C Winner is the loser of B Finals.
  //    - If P = 2: C Winner is null (not enough players).
  // Let's identify the final matches of A, B, and C dynamically based on the generated arrays:
  const lastAMatchId = `te-a-r${numRounds}-m1`;
  
  // Find B-winner match: the last round of B
  const lastBMatches = bMatches[bMatches.length - 1] || [];
  const lastBMatchId = lastBMatches.length > 0 ? lastBMatches[0].id : '';

  // Find C-winner match: the last round of C
  let lastCMatchId = '';
  let cWinnerSource: PlayerSource | null = null;

  if (cMatches.length > 0) {
    const lastCMatches = cMatches[cMatches.length - 1] || [];
    if (lastCMatches.length > 0) {
      lastCMatchId = lastCMatches[0].id;
      cWinnerSource = { type: 'match_winner', id: lastCMatchId };
    }
  } else {
    // If no C matches are generated (P <= 4), the C-winner is the loser of the B Finals!
    if (lastBMatchId) {
      cWinnerSource = { type: 'match_loser', id: lastBMatchId };
    }
  }

  // Final Stage matches:
  // Match 1 (Semifinals): B Winner vs C Winner
  // Match 2 (Grand Finals): A Winner vs Semifinals Winner
  const sfMatchId = `te-sf`;
  const sfMatch: MatchWithSources = {
    id: sfMatchId,
    round: numRounds * 2 + 1, // Finals Round 1
    player1Id: '',
    player2Id: null,
    result: null,
    status: 'pending',
    bracketType: 'grand_final',
    p1Source: lastBMatchId ? { type: 'match_winner', id: lastBMatchId } : undefined,
    p2Source: cWinnerSource || undefined,
  };

  const gfMatchId = `te-gf`;
  const gfMatch: MatchWithSources = {
    id: gfMatchId,
    round: numRounds * 2 + 2, // Finals Round 2
    player1Id: '',
    player2Id: null,
    result: null,
    status: 'pending',
    bracketType: 'grand_final',
    p1Source: { type: 'match_winner', id: lastAMatchId },
    p2Source: { type: 'match_winner', id: sfMatchId },
  };

  // Compile all matches into UI rounds
  // UI Round 1: A Round 1
  // UI Round 2: A Round 2, B Round 1
  // UI Round 3: B Round 2 (Major)
  // UI Round 4: A Round 3, B Round 3 (Minor), C Round 1
  // Let's structure the UI rounds cleanly:
  // We can just group:
  // UI Round r (for r from 1 to numRounds):
  // - A Round r
  // - B Minor Round (2r-3) if exists
  // - B Major Round (2r-2) if exists
  // - C Minor Round (2r-5) if exists
  // - C Major Round (2r-4) if exists
  // This is a bit detailed but we can simply group matches by their logical UI Round to display.
  // To keep it simple and perfectly aligned:
  // Let's map Winners (A), Losers (B), C-bracket matches to UI rounds.
  // We can put them in UI Round 1, UI Round 2, UI Round 3 ...
  // Let's make the round assignments:
  // - A-bracket matches: Round r is UI Round r.
  // - B-bracket matches: Round br is UI Round br + 1 (so BR1 is in UI Round 2, playing alongside AR2).
  // - C-bracket matches: Round cr is UI Round cr + 2 (so CR1 is in UI Round 3, playing alongside BR2).
  // Let's check if this is clean:
  // Yes!
  // - AR1 -> UI Round 1
  // - AR2, BR1 -> UI Round 2
  // - AR3, BR2, CR1 -> UI Round 3
  // - AR4, BR3, BR4, CR2, CR3 -> UI Round 4 (Wait, let's just group them by their round number + offset!)
  
  const uiRoundsMap = new Map<number, MatchWithSources[]>();
  
  // Add A Matches
  aMatches.forEach((roundMatches, idx) => {
    const uiRound = idx + 1;
    const current = uiRoundsMap.get(uiRound) || [];
    uiRoundsMap.set(uiRound, [...current, ...roundMatches]);
  });

  // Add B Matches (offset by 1)
  bMatches.forEach((roundMatches, idx) => {
    const uiRound = idx + 2;
    const current = uiRoundsMap.get(uiRound) || [];
    uiRoundsMap.set(uiRound, [...current, ...roundMatches]);
  });

  // Add C Matches (offset by 3)
  cMatches.forEach((roundMatches, idx) => {
    const uiRound = idx + 4;
    const current = uiRoundsMap.get(uiRound) || [];
    uiRoundsMap.set(uiRound, [...current, ...roundMatches]);
  });

  // Convert map to rounds array
  const maxUiRound = Math.max(...Array.from(uiRoundsMap.keys()), 0);
  for (let r = 1; r <= maxUiRound; r++) {
    const matches = uiRoundsMap.get(r) || [];
    if (matches.length > 0) {
      rounds.push({
        roundNumber: r,
        matches,
        isCompleted: false,
      });
    }
  }

  // Add Semifinals and Finals UI rounds
  const finalsStartRound = rounds.length + 1;
  rounds.push({
    roundNumber: finalsStartRound,
    matches: [sfMatch],
    isCompleted: false,
  });

  rounds.push({
    roundNumber: finalsStartRound + 1,
    matches: [gfMatch],
    isCompleted: false,
  });

  // Propagate seeds and initial byes
  return propagateEliminationResults(rounds, sortedPlayers);
}
