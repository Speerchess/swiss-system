import type { Player, Match, Round } from './types';

export function generateRoundRobin(players: Player[]): Round[] {
  const activePlayers = players.filter((p) => p.active);
  const n = activePlayers.length;
  
  if (n < 2) return [];

  const hasBye = n % 2 !== 0;
  const numRounds = hasBye ? n : n - 1;
  const P = hasBye ? n + 1 : n;

  // Create pairing list (contains Player or null for bye)
  const list: (Player | null)[] = [...activePlayers];
  if (hasBye) {
    list.push(null); // dummy player representing a bye
  }

  const rounds: Round[] = [];

  for (let r = 0; r < numRounds; r++) {
    const matches: Match[] = [];
    
    for (let i = 0; i < P / 2; i++) {
      const p1 = list[i];
      const p2 = list[P - 1 - i];

      if (p1 && p2) {
        // Alternating colors based on round and index for balance
        // Fixed player (index 0) alternates colors every round
        const p1GetsWhite = i === 0 ? r % 2 === 0 : (r + i) % 2 === 0;
        
        matches.push({
          id: `rr-r${r + 1}-m${i + 1}`,
          round: r + 1,
          player1Id: p1GetsWhite ? p1.id : p2.id,
          player2Id: p1GetsWhite ? p2.id : p1.id,
          result: null,
          status: 'pending',
        });
      } else if (p1 || p2) {
        // Bye match
        const byePlayer = p1 || p2;
        if (byePlayer) {
          matches.push({
            id: `rr-r${r + 1}-bye-${byePlayer.id}`,
            round: r + 1,
            player1Id: byePlayer.id,
            player2Id: null,
            result: '1-0', // Bye gets 1 point
            status: 'completed',
          });
        }
      }
    }

    // Rotate list (keeping first element fixed)
    // Shift elements: list[1] takes list[P-1], list[2] takes list[1]...
    const last = list[P - 1];
    for (let k = P - 1; k > 1; k--) {
      list[k] = list[k - 1];
    }
    list[1] = last;

    rounds.push({
      roundNumber: r + 1,
      matches,
      isCompleted: matches.every((m) => m.status === 'completed'),
    });
  }

  return rounds;
}
