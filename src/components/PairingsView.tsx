import React, { useState } from 'react';
import type { Match, Player, MatchResult, TournamentType } from '../logic/types';
import { AlertCircle, Camera, X } from 'lucide-react';
import { toPng } from 'html-to-image';

interface PairingsViewProps {
  roundNumber: number;
  matches: Match[];
  players: Player[];
  onEnterResult: (matchId: string, result: MatchResult) => void;
  isCurrentRound: boolean;
  tournamentCompleted: boolean;
  tournamentType?: TournamentType;
}

export const PairingsView: React.FC<PairingsViewProps> = ({
  roundNumber,
  matches,
  players,
  onEnterResult,
  isCurrentRound,
  tournamentCompleted,
  tournamentType,
}) => {
  const isElimination = tournamentType === 'single' || tournamentType === 'double' || tournamentType === 'triple';
  // Track which match is currently opening its result selector
  const [activeEditingMatchId, setActiveEditingMatchId] = useState<string | null>(null);

  const playerMap = new Map<string, Player>(players.map((p) => [p.id, p]));

  const getPlayerData = (playerId: string | null) => {
    if (!playerId) return { name: 'BYE', rating: undefined, score: 0 };
    const player = playerMap.get(playerId);
    if (!player) return { name: '알 수 없음', rating: undefined, score: 0 };
    return { name: player.name, rating: player.rating, score: player.score };
  };

  const isRoundPending = matches.some((m) => m.status === 'pending');

  // Export pairings card to PNG
  const handleDownloadPNG = () => {
    const node = document.getElementById('pairings-card');
    if (!node) return;

    const tableContainer = node.querySelector('.pairings-table-container') as HTMLElement;
    const table = node.querySelector('table') as HTMLElement;

    // Expand to fit full scrollable width of the table during capture
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
        // Exclude download button, result selectors, or modification buttons from the image
        if (domNode.classList && (
          domNode.classList.contains('btn-download-png') || 
          domNode.classList.contains('result-buttons') ||
          domNode.classList.contains('set-result-btn') ||
          domNode.tagName === 'BUTTON'
        )) {
          return false;
        }
        return true;
      }
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `round_${roundNumber}_pairings.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((error) => {
        console.error('Pairings PNG export failed', error);
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

  const handleResultClick = (matchId: string, result: MatchResult) => {
    onEnterResult(matchId, result);
    setActiveEditingMatchId(null);
  };

  return (
    <div className="glass-card" id="pairings-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>
          Round #{roundNumber} 대진 및 결과
        </h3>
        <button
          className="btn btn-secondary btn-download-png"
          style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', gap: '0.35rem' }}
          onClick={handleDownloadPNG}
          type="button"
          title="대진표 이미지 다운로드"
        >
          <Camera size={14} />
          이미지 저장
        </button>
      </div>

      {isCurrentRound && !tournamentCompleted && isRoundPending && (
        <div className="alert alert-info">
          <AlertCircle className="alert-icon" size={20} />
          <span>모든 경기의 결과를 입력한 뒤 다음 라운드를 진행할 수 있습니다.</span>
        </div>
      )}

      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          대진표가 비어 있습니다.
        </div>
      ) : (
        <div className="pairings-table-container">
          <table className="pairings-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'center', width: '60px' }}>Pair</th>
                <th style={{ textAlign: 'right', paddingRight: '1.5rem' }}>White Player</th>
                <th style={{ textAlign: 'center', width: '70px' }}>Pts</th>
                <th style={{ textAlign: 'center', width: '180px' }}>Result</th>
                <th style={{ textAlign: 'center', width: '70px' }}>Pts</th>
                <th style={{ textAlign: 'left', paddingLeft: '1.5rem' }}>Black Player</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match, idx) => {
                const p1 = getPlayerData(match.player1Id);
                const p2 = getPlayerData(match.player2Id);
                const isBye = match.player2Id === null;
                const isEditing = activeEditingMatchId === match.id;

                return (
                  <tr key={match.id}>
                    {/* Pair number */}
                    <td style={{ textAlign: 'center', fontWeight: '700', color: 'var(--text-secondary)' }}>
                      {idx + 1}
                    </td>

                    {/* White Player */}
                    <td style={{ textAlign: 'right', fontWeight: '600', paddingRight: '1.5rem' }}>
                      {p1.name}
                      {p1.rating !== undefined && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.4rem', fontWeight: 'normal' }}>
                          ({p1.rating})
                        </span>
                      )}
                    </td>

                    {/* White Player Pts */}
                    <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '500' }}>
                      {p1.score.toFixed(1)}
                    </td>

                    {/* Result cell */}
                    <td style={{ textAlign: 'center' }}>
                      {isBye ? (
                        <span style={{ fontWeight: '700', color: 'var(--color-success-hover)', fontSize: '0.85rem' }}>
                          1 - 0 (부전승)
                        </span>
                      ) : (
                        <>
                          {isCurrentRound && !tournamentCompleted ? (
                            match.status === 'completed' && match.result && !isEditing ? (
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="result-cell-completed">
                                  {match.result === '1/2-1/2' ? '½ - ½' : match.result}
                                </span>
                                <button
                                  className="set-result-btn"
                                  onClick={() => setActiveEditingMatchId(match.id)}
                                  style={{ fontSize: '0.75rem' }}
                                >
                                  수정
                                </button>
                              </div>
                            ) : (
                              <div className="result-buttons" style={{ justifyContent: 'center', alignItems: 'center', gap: '0.25rem' }}>
                                <button
                                  className="btn-result"
                                  onClick={() => handleResultClick(match.id, '1-0')}
                                  title="백 승 (1-0)"
                                >
                                  1-0
                                </button>
                                {!isElimination && (
                                  <button
                                    className="btn-result"
                                    onClick={() => handleResultClick(match.id, '1/2-1/2')}
                                    title="무승부 (½-½)"
                                  >
                                    ½-½
                                  </button>
                                )}
                                <button
                                  className="btn-result"
                                  onClick={() => handleResultClick(match.id, '0-1')}
                                  title="흑 승 (0-1)"
                                >
                                  0-1
                                </button>
                                {isEditing && (
                                  <button
                                    className="btn-result"
                                    style={{ padding: '0.35rem', display: 'flex', alignItems: 'center', background: '#fee2e2', borderColor: '#fca5a5' }}
                                    onClick={() => setActiveEditingMatchId(null)}
                                    title="취소"
                                  >
                                    <X size={12} style={{ color: '#ef4444' }} />
                                  </button>
                                )}
                              </div>
                            )
                          ) : (
                            <span className="result-cell-completed">
                              {match.status === 'completed' && match.result
                                ? (match.result === '1/2-1/2' ? '½ - ½' : match.result)
                                : '진행 중'
                              }
                            </span>
                          )}
                        </>
                      )}
                    </td>

                    {/* Black Player Pts */}
                    <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '500' }}>
                      {isBye ? '-' : p2.score.toFixed(1)}
                    </td>

                    {/* Black Player */}
                    <td style={{ textAlign: 'left', fontWeight: '600', paddingLeft: '1.5rem', color: isBye ? 'var(--text-muted)' : 'inherit' }}>
                      {p2.name}
                      {!isBye && p2.rating !== undefined && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.4rem', fontWeight: 'normal' }}>
                          ({p2.rating})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
