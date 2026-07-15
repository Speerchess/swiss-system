import type { Player, Round, TiebreakType } from '../logic/types';
import { comparePlayers } from '../logic/tiebreaks';

interface StandingsTableProps {
  players: Player[];
  tiebreakOrder: TiebreakType[];
  rounds: Round[];
  onTogglePlayerActive?: (playerId: string) => void;
  isCompleted: boolean;
}

const TIEBREAK_SHORT_NAMES: Record<TiebreakType, string> = {
  'buchholz': 'BH',
  'median-buchholz': 'M-BH',
  'sonneborn-berger': 'SB',
  'cumulative': 'CUM',
  'direct-encounter': 'DE',
  'rating': 'Rtg',
};

const TIEBREAK_TOOLTIPS: Record<TiebreakType, string> = {
  'buchholz': 'Buchholz (상대방 점수의 합)',
  'median-buchholz': 'Median Buchholz (최고, 최저를 제외한 상대방 점수의 합)',
  'sonneborn-berger': 'Sonneborn-Berger (이긴 상대방의 점수 + 비긴 상대방 점수의 절반)',
  'cumulative': 'Cumulative (라운드별 누적 점수의 합)',
  'direct-encounter': 'Direct Encounter (승자승)',
  'rating': 'Rating (본인 레이팅)',
};

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

  // Helper to count W-D-L record
  const getPlayerRecord = (playerId: string) => {
    let wins = 0;
    let draws = 0;
    let losses = 0;

    for (const round of rounds) {
      for (const match of round.matches) {
        if (match.status !== 'completed') continue;

        if (match.player1Id === playerId) {
          if (match.player2Id === null) {
            wins++; // Bye is a win
          } else if (match.result === '1-0') {
            wins++;
          } else if (match.result === '0-1') {
            losses++;
          } else if (match.result === '1/2-1/2') {
            draws++;
          } else if (match.result === '0-0') {
            losses++;
          }
        } else if (match.player2Id === playerId) {
          if (match.result === '0-1') {
            wins++;
          } else if (match.result === '1-0') {
            losses++;
          } else if (match.result === '1/2-1/2') {
            draws++;
          } else if (match.result === '0-0') {
            losses++;
          }
        }
      }
    }

    return `${wins}승 - ${draws}무 - ${losses}패`;
  };

  return (
    <div className="glass-card">
      <h3 className="section-title">현재 순위</h3>
      
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="rank-cell">순위</th>
              <th>이름</th>
              <th>레이팅</th>
              <th>승점 (Score)</th>
              {/* Render header columns for active tiebreaks */}
              {tiebreakOrder.map((criteria) => (
                <th key={criteria} title={TIEBREAK_TOOLTIPS[criteria]}>
                  {TIEBREAK_SHORT_NAMES[criteria]}
                </th>
              ))}
              <th>전적 (W-D-L)</th>
              {!isCompleted && onTogglePlayerActive && (
                <th style={{ textAlign: 'center' }}>상태</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player, idx) => {
              const record = getPlayerRecord(player.id);
              
              return (
                <tr 
                  key={player.id} 
                  style={{ opacity: player.active ? 1 : 0.5 }}
                >
                  <td className="rank-cell">{idx + 1}</td>
                  <td style={{ fontWeight: '700' }}>
                    {player.name}
                    {!player.active && (
                      <span style={{ 
                        fontSize: '0.7rem', 
                        background: 'var(--color-danger-bg)', 
                        color: 'var(--color-danger-hover)',
                        padding: '0.1rem 0.3rem',
                        borderRadius: '4px',
                        marginLeft: '0.5rem',
                        fontWeight: 'normal'
                      }}>
                        기권
                      </span>
                    )}
                  </td>
                  <td>{player.rating !== undefined ? player.rating : '-'}</td>
                  <td style={{ fontWeight: '800', color: 'var(--color-primary-hover)' }}>
                    {player.score.toFixed(1).replace('.0', '')}
                  </td>
                  {/* Render tiebreak scores */}
                  {tiebreakOrder.map((criteria) => {
                    if (criteria === 'direct-encounter') {
                      return <td key={criteria}>-</td>; // pairwise, shown as - in table
                    }
                    const val = player.tiebreaks[criteria as keyof typeof player.tiebreaks];
                    return (
                      <td key={criteria}>
                        {typeof val === 'number' 
                          ? val.toFixed(2).replace('.00', '').replace(/(\.0)$/, '') 
                          : '-'}
                      </td>
                    );
                  })}
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {record}
                  </td>
                  {!isCompleted && onTogglePlayerActive && (
                    <td style={{ textAlign: 'center' }}>
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
      
      <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <div><strong>타이브레이크 범례:</strong></div>
        {tiebreakOrder.map(criteria => (
          <div key={criteria}>
            <strong>{TIEBREAK_SHORT_NAMES[criteria]}:</strong> {TIEBREAK_TOOLTIPS[criteria].split(' (')[0]}
          </div>
        ))}
      </div>
    </div>
  );
};
