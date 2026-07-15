import React from 'react';
import type { Player, Round, TiebreakType, MatchResult } from '../logic/types';
import { comparePlayers } from '../logic/tiebreaks';
import { toPng } from 'html-to-image';
import { Camera } from 'lucide-react';

interface StandingsTableProps {
  players: Player[];
  tiebreakOrder: TiebreakType[];
  rounds: Round[];
  onTogglePlayerActive?: (playerId: string) => void;
  isCompleted: boolean;
}

const TIEBREAK_SHORT_NAMES: Record<TiebreakType, string> = {
  'buchholz': 'BucT',
  'median-buchholz': 'M-BH',
  'buchholz-cut1': 'Buc1',
  'sonneborn-berger': 'SB',
  'cumulative': 'CUM',
  'direct-encounter': 'DE',
  'rating': 'Rtg',
};

const TIEBREAK_TOOLTIPS: Record<TiebreakType, string> = {
  'buchholz': 'Buchholz (상대방 점수의 합)',
  'median-buchholz': 'Median Buchholz (최고·최저 제외 상대 점수 합)',
  'buchholz-cut1': 'Buchholz Cut 1 (최저 1개 제외 상대 점수 합)',
  'sonneborn-berger': 'Sonneborn-Berger (이긴 상대 점수 + 비긴 상대 점수×0.5)',
  'cumulative': 'Cumulative (라운드별 누적 점수의 합)',
  'direct-encounter': 'Direct Encounter (승자승)',
  'rating': 'Rating (본인 레이팅)',
};

/**
 * Build round-by-round result notation for a given player.
 * Format examples: +W3, =B2, -W1, +BYE
 *   +  = win
 *   =  = draw
 *   -  = loss
 *   W/B = color played (White / Black)
 *   number = opponent's current POSITION (rank) in the standings
 */
function buildRoundResults(
  player: Player,
  rounds: Round[],
  sortedPlayers: Player[]
): Array<{ text: string; cssClass: string }> {
  // Build a map from playerId -> current position (1-based)
  const positionMap = new Map<string, number>();
  sortedPlayers.forEach((p, idx) => positionMap.set(p.id, idx + 1));

  const results: Array<{ text: string; cssClass: string }> = [];

  for (const round of rounds) {
    let found = false;

    for (const match of round.matches) {
      const isP1 = match.player1Id === player.id;
      const isP2 = match.player2Id === player.id;

      if (!isP1 && !isP2) continue;
      found = true;

      // Handle bye
      if (match.player2Id === null && isP1) {
        results.push({ text: '+BYE', cssClass: 'round-result-bye' });
        break;
      }

      if (match.status !== 'completed' || match.result === null) {
        results.push({ text: '...', cssClass: '' });
        break;
      }

      // Determine color played by this player
      // player1Id = White, player2Id = Black
      const color = isP1 ? 'W' : 'B';
      
      // Opponent's id
      const opponentId = isP1 ? match.player2Id! : match.player1Id;
      const opponentPos = positionMap.get(opponentId) ?? '?';

      // Determine result symbol for this player
      let symbol: string;
      let cssClass: string;

      const result = match.result as MatchResult;
      if (result === '1-0') {
        // White wins
        if (isP1) {
          symbol = '+';
          cssClass = 'round-result-win';
        } else {
          symbol = '-';
          cssClass = 'round-result-loss';
        }
      } else if (result === '0-1') {
        // Black wins
        if (isP2) {
          symbol = '+';
          cssClass = 'round-result-win';
        } else {
          symbol = '-';
          cssClass = 'round-result-loss';
        }
      } else if (result === '1/2-1/2') {
        symbol = '=';
        cssClass = 'round-result-draw';
      } else {
        // '0-0' double loss or unknown
        symbol = '-';
        cssClass = 'round-result-loss';
      }

      results.push({ text: `${symbol}${color}${opponentPos}`, cssClass });
      break;
    }

    if (!found) {
      // Player didn't participate in this round (withdrawn, etc.)
      results.push({ text: '-', cssClass: 'round-result-loss' });
    }
  }

  return results;
}

export const StandingsTable: React.FC<StandingsTableProps> = ({
  players,
  tiebreakOrder,
  rounds,
  onTogglePlayerActive,
  isCompleted,
}) => {
  // Sort players using our tiebreaks comparator
  const sortedPlayers = [...players].sort((a, b) =>
    comparePlayers(a, b, tiebreakOrder, rounds)
  );

  // Compute position numbers (handle ties - same rank for equal scores)
  const positions: string[] = [];
  sortedPlayers.forEach((player, idx) => {
    if (idx === 0) {
      positions.push('1');
    } else {
      const prev = sortedPlayers[idx - 1];
      if (player.score === prev.score) {
        // Check if tiebreaks are identical (simplified: just use same position text)
        positions.push(positions[idx - 1]);
      } else {
        positions.push((idx + 1).toString());
      }
    }
  });

  // Get completed rounds (only show round columns for rounds that exist)
  const completedOrActiveRounds = rounds.filter(r => r.matches.length > 0);

  // Export current standings card to PNG
  const handleDownloadPNG = () => {
    const node = document.getElementById('standings-card');
    if (!node) return;

    const tableContainer = node.querySelector('.table-container') as HTMLElement;
    const table = node.querySelector('table') as HTMLElement;
    
    // We want the export card to span the entire scrollable table width so nothing is clipped.
    const scrollWidth = table ? table.scrollWidth : node.scrollWidth;
    const fullWidth = Math.max(node.clientWidth, scrollWidth + 48);
    const fullHeight = node.scrollHeight;

    // Temporarily style the elements directly
    const originalOverflowX = tableContainer ? tableContainer.style.overflowX : '';
    const originalWidth = tableContainer ? tableContainer.style.width : '';
    const originalMaxWidth = tableContainer ? tableContainer.style.maxWidth : '';
    const originalNodeWidth = node.style.width;
    const originalNodeMaxWidth = node.style.maxWidth;
    
    if (tableContainer) {
      tableContainer.style.overflowX = 'visible';
      tableContainer.style.width = 'auto';
      tableContainer.style.maxWidth = 'none';
    }
    
    node.style.width = `${fullWidth}px`;
    node.style.maxWidth = 'none';

    toPng(node, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      width: fullWidth,
      height: fullHeight,
      style: {
        borderRadius: '0px',
        width: `${fullWidth}px`,
        height: `${fullHeight}px`,
        transform: 'scale(1)',
        transformOrigin: 'top left',
      },
      filter: (domNode: any) => {
        // Exclude download buttons or withdrawal buttons from the image
        if (domNode.classList && (
          domNode.classList.contains('btn-download-png') ||
          domNode.classList.contains('btn')
        )) {
          return false;
        }
        return true;
      }
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = isCompleted ? 'final_standings.png' : 'current_standings.png';
        link.href = dataUrl;
        link.click();
      })
      .catch((error) => {
        console.error('Standings PNG export failed', error);
      })
      .finally(() => {
        // Restore styles
        if (tableContainer) {
          tableContainer.style.overflowX = originalOverflowX;
          tableContainer.style.width = originalWidth;
          tableContainer.style.maxWidth = originalMaxWidth;
        }
        node.style.width = originalNodeWidth;
        node.style.maxWidth = originalNodeMaxWidth;
      });
  };

  return (
    <div className="glass-card" id="standings-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>
          {isCompleted ? '🏆 최종 순위' : '현재 순위'}
        </h3>
        <button
          className="btn btn-secondary btn-download-png"
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', gap: '0.35rem' }}
          onClick={handleDownloadPNG}
          type="button"
          title="순위표 이미지 다운로드"
        >
          <Camera size={14} />
          이미지 저장
        </button>
      </div>
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'center', width: '60px' }}>Position</th>
              <th>Name</th>
              <th style={{ textAlign: 'center' }}>Points</th>
              {/* Round-by-round result columns */}
              {completedOrActiveRounds.map((round) => (
                <th key={round.roundNumber} style={{ textAlign: 'center' }} title={`${round.roundNumber} 라운드 결과`}>
                  R{round.roundNumber}
                </th>
              ))}
              {/* Tiebreak columns */}
              {tiebreakOrder.map((criteria) => (
                <th key={criteria} style={{ textAlign: 'center' }} title={TIEBREAK_TOOLTIPS[criteria]}>
                  {TIEBREAK_SHORT_NAMES[criteria]}
                </th>
              ))}
              {!isCompleted && onTogglePlayerActive && (
                <th style={{ textAlign: 'center' }} className="btn-download-png">상태</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player, idx) => {
              const roundResults = buildRoundResults(player, completedOrActiveRounds, sortedPlayers);

              return (
                <tr 
                  key={player.id} 
                  style={{ opacity: player.active ? 1 : 0.5 }}
                >
                  <td style={{ textAlign: 'center', fontWeight: '700' }}>
                    {positions[idx]}
                    {positions[idx] !== (idx + 1).toString() && idx > 0 && positions[idx] === positions[idx - 1] && (
                      <span></span>
                    )}
                  </td>
                  <td style={{ fontWeight: '600' }}>
                    {player.name}
                    {player.rating !== undefined && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                        ({player.rating})
                      </span>
                    )}
                    {!player.active && (
                      <span style={{ 
                        fontSize: '0.7rem', 
                        background: '#fce4ec', 
                        color: '#c62828',
                        padding: '0.1rem 0.3rem',
                        borderRadius: '4px',
                        marginLeft: '0.5rem',
                        fontWeight: 'normal'
                      }}>
                        기권
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '800', fontSize: '1rem' }}>
                    {player.score % 1 === 0 ? player.score.toFixed(1) : player.score.toFixed(1)}
                  </td>
                  {/* Round-by-round notation cells */}
                  {roundResults.map((rr, rIdx) => (
                    <td key={rIdx} style={{ textAlign: 'center', fontWeight: '600', fontSize: '0.85rem' }}>
                      <span className={rr.cssClass}>{rr.text}</span>
                    </td>
                  ))}
                  {/* Pad missing round cells if player has fewer results than rounds */}
                  {completedOrActiveRounds.length > roundResults.length && (
                    Array.from({ length: completedOrActiveRounds.length - roundResults.length }).map((_, i) => (
                      <td key={`pad-${i}`} style={{ textAlign: 'center' }}>-</td>
                    ))
                  )}
                  {/* Tiebreak value cells */}
                  {tiebreakOrder.map((criteria) => {
                    if (criteria === 'direct-encounter') {
                      return <td key={criteria} style={{ textAlign: 'center' }}>-</td>;
                    }
                    const val = player.tiebreaks[criteria as keyof typeof player.tiebreaks];
                    return (
                      <td key={criteria} style={{ textAlign: 'center' }}>
                        {typeof val === 'number'
                          ? val.toFixed(1)
                          : '-'}
                      </td>
                    );
                  })}
                  {!isCompleted && onTogglePlayerActive && (
                    <td style={{ textAlign: 'center' }} className="btn-download-png">
                      <button
                        className={`btn ${player.active ? 'btn-secondary' : 'btn-danger'}`}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => onTogglePlayerActive(player.id)}
                        type="button"
                      >
                        {player.active ? '기권 처리' : '복귀'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
