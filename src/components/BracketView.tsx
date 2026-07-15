import React, { useState } from 'react';
import type { Round, Player, Match } from '../logic/types';
import type { MatchWithSources, PlayerSource } from '../logic/elimination';
import { Camera } from 'lucide-react';
import { toPng } from 'html-to-image';

interface BracketViewProps {
  rounds: Round[];
  players: Player[];
  type: 'single' | 'double' | 'triple';
}

export const BracketView: React.FC<BracketViewProps> = ({ rounds, players, type }) => {
  const [selectedSubBracket, setSelectedSubBracket] = useState<'all' | 'winners' | 'losers' | 'c_bracket' | 'finals'>('all');
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Helper to resolve player name/text from ID or Source
  const resolvePlayerText = (
    playerId: string | null,
    source?: PlayerSource
  ): { name: string; isSeed: boolean; isMatchDep: boolean; isBye: boolean } => {
    if (playerId) {
      const p = playerMap.get(playerId);
      return {
        name: p ? p.name : '알 수 없음',
        isSeed: false,
        isMatchDep: false,
        isBye: false,
      };
    }

    if (source) {
      if (source.type === 'seed') {
        const seedIdx = parseInt(source.id.split('-')[1], 10);
        const seedPlayer = players[seedIdx];
        if (seedPlayer) {
          return { name: seedPlayer.name, isSeed: false, isMatchDep: false, isBye: false };
        }
        return { name: `부전승`, isSeed: false, isMatchDep: false, isBye: true };
      }

      const matchNum = source.id.split('-').pop(); // e.g. "m1" -> "1"
      const bracketLabel = source.id.includes('-w-') || source.id.includes('-a-')
        ? '승자조'
        : source.id.includes('-l-') || source.id.includes('-b-')
        ? '패자조'
        : source.id.includes('-c-')
        ? 'C조'
        : '경기';
      
      const typeLabel = source.type === 'match_winner' ? '승자' : '패자';
      return {
        name: `[${bracketLabel} ${matchNum} ${typeLabel}]`,
        isSeed: false,
        isMatchDep: true,
        isBye: false,
      };
    }

    return { name: '부전승', isSeed: false, isMatchDep: false, isBye: true };
  };

  // Helper to get scores/results to display
  const getPlayerMatchResult = (match: Match, isPlayer1: boolean) => {
    if (match.status !== 'completed') return '-';
    if (match.player2Id === null) {
      return isPlayer1 ? '부전승' : '-';
    }
    if (match.result === '1-0') {
      return isPlayer1 ? '승' : '패';
    }
    if (match.result === '0-1') {
      return isPlayer1 ? '패' : '승';
    }
    return '-';
  };

  // Check if player won the match
  const isWinner = (match: Match, playerId: string | null) => {
    if (match.status !== 'completed' || !playerId) return false;
    if (match.player2Id === null && match.player1Id === playerId) return true;
    if (match.result === '1-0' && match.player1Id === playerId) return true;
    if (match.result === '0-1' && match.player2Id === playerId) return true;
    return false;
  };

  // Check which sub-brackets have any matches
  const hasLosersBracket = type === 'double' || type === 'triple';
  const hasCBracket = type === 'triple';

  // Export bracket card to PNG
  const handleDownloadPNG = () => {
    const node = document.getElementById('bracket-card');
    if (!node) return;

    const bracketOuters = node.querySelectorAll('.bracket-outer');
    const bracketContainers = node.querySelectorAll('.bracket-container');

    // Find the maximum scroll width among all bracket containers
    let maxScrollWidth = node.scrollWidth;
    bracketContainers.forEach((container: any) => {
      if (container.scrollWidth > maxScrollWidth) {
        maxScrollWidth = container.scrollWidth;
      }
    });

    const fullWidth = Math.max(node.clientWidth, maxScrollWidth + 48);
    const fullHeight = node.scrollHeight;

    // Temporarily style elements directly
    const originalStyles = Array.from(bracketOuters).map((outer: any) => {
      const style = {
        overflow: outer.style.overflow,
        width: outer.style.width
      };
      outer.style.overflow = 'visible';
      outer.style.width = 'auto';
      return style;
    });

    const originalNodeWidth = node.style.width;
    const originalNodeMaxWidth = node.style.maxWidth;

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
        // Exclude specific action elements like buttons
        if (domNode.classList && (
          domNode.classList.contains('btn-download-png') || 
          domNode.classList.contains('bracket-section-selector')
        )) {
          return false;
        }
        return true;
      }
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `${type}_elimination_bracket_${selectedSubBracket}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((error) => {
        console.error('Bracket PNG export failed', error);
      })
      .finally(() => {
        // Restore styles
        bracketOuters.forEach((outer: any, idx: number) => {
          const orig = originalStyles[idx];
          if (orig) {
            outer.style.overflow = orig.overflow;
            outer.style.width = orig.width;
          }
        });
        node.style.width = originalNodeWidth;
        node.style.maxWidth = originalNodeMaxWidth;
      });
  };

  const renderSubBracket = (subBracket: 'winners' | 'losers' | 'c_bracket' | 'finals', title: string) => {
    // Group rounds that actually contain matches for the selected sub-bracket
    const subRounds = rounds
      .map((r) => ({
        ...r,
        matches: (r.matches as MatchWithSources[]).filter((m) => {
          const bType = m.bracketType;
          if (subBracket === 'winners') return bType === 'winners';
          if (subBracket === 'losers') return bType === 'losers';
          if (subBracket === 'c_bracket') return bType === 'c_bracket';
          if (subBracket === 'finals') return bType === 'grand_final' || bType === 'grand_final_reset';
          return false;
        }),
      }))
      .filter((r) => r.matches.length > 0);

    if (subRounds.length === 0) return null;

    const showSubHeader = type !== 'single';

    return (
      <div style={{ marginBottom: '2.5rem' }}>
        {showSubHeader && (
          <h4 style={{ 
            fontSize: '1.1rem', 
            fontWeight: '700', 
            color: 'var(--color-primary)', 
            marginBottom: '1rem',
            borderBottom: '2px solid var(--border-light)',
            paddingBottom: '0.4rem'
          }}>
            {title}
          </h4>
        )}
        <div className="bracket-outer">
          <div className="bracket-container">
            {subRounds.map((round) => (
              <div key={round.roundNumber} className="bracket-round">
                <div className="bracket-round-title">
                  {subBracket === 'finals' 
                    ? `결승 라운드 ${round.roundNumber}` 
                    : `${round.roundNumber} 라운드`}
                </div>
                
                {round.matches.map((match: MatchWithSources) => {
                  const p1 = resolvePlayerText(match.player1Id, match.p1Source);
                  const p2 = resolvePlayerText(match.player2Id, match.p2Source);

                  const p1Won = isWinner(match, match.player1Id);
                  const p2Won = isWinner(match, match.player2Id);
                  const p1Lost = match.status === 'completed' && !p1Won && match.player2Id !== null;
                  const p2Lost = match.status === 'completed' && !p2Won && match.player2Id !== null;

                  const matchNum = match.id.split('-').pop(); // e.g. "m1" -> "1"
                  
                  return (
                    <div 
                      key={match.id} 
                      className={`bracket-match-node ${
                        match.status === 'completed' ? 'completed' : ''
                      }`}
                    >
                      <div 
                        style={{ 
                          fontSize: '0.65rem', 
                          padding: '0.2rem 0.5rem', 
                          background: 'rgba(255,255,255,0.03)',
                          borderBottom: '1px solid var(--border-light)',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>경기 #{matchNum}</span>
                        {match.status === 'pending' && (
                          <span style={{ color: 'var(--color-warning)' }}>진행 중</span>
                        )}
                      </div>

                      {/* Player 1 Row */}
                      <div 
                        className={`bracket-player-row ${
                          p1Won ? 'winner' : p1Lost ? 'loser' : ''
                        }`}
                      >
                        <span 
                          className="bracket-player-name"
                          style={{ 
                            color: p1.isMatchDep ? 'var(--text-muted)' : 'inherit',
                            fontStyle: p1.isMatchDep ? 'italic' : 'normal'
                          }}
                        >
                          {p1.name}
                        </span>
                        <span className="bracket-player-score">
                          {getPlayerMatchResult(match, true)}
                        </span>
                      </div>

                      {/* Player 2 Row */}
                      <div 
                        className={`bracket-player-row ${
                          p2Won ? 'winner' : p2Lost ? 'loser' : ''
                        }`}
                      >
                        <span 
                          className="bracket-player-name"
                          style={{ 
                            color: p2.isMatchDep ? 'var(--text-muted)' : 'inherit',
                            fontStyle: p2.isMatchDep ? 'italic' : 'normal'
                          }}
                        >
                          {p2.name}
                        </span>
                        <span className="bracket-player-score">
                          {getPlayerMatchResult(match, false)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card" style={{ width: '100%' }} id="bracket-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>대진표 (Brackets)</h3>
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

      {/* Sub-bracket selector buttons */}
      {(hasLosersBracket || hasCBracket) && (
        <div className="bracket-section-selector">
          <button
            className={`bracket-sec-btn ${selectedSubBracket === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedSubBracket('all')}
          >
            전체 보기 (All Brackets)
          </button>
          <button
            className={`bracket-sec-btn ${selectedSubBracket === 'winners' ? 'active' : ''}`}
            onClick={() => setSelectedSubBracket('winners')}
          >
            승자조 (Winners)
          </button>
          {hasLosersBracket && (
            <button
              className={`bracket-sec-btn ${selectedSubBracket === 'losers' ? 'active' : ''}`}
              onClick={() => setSelectedSubBracket('losers')}
            >
              패자조 (Losers)
            </button>
          )}
          {hasCBracket && (
            <button
              className={`bracket-sec-btn ${selectedSubBracket === 'c_bracket' ? 'active' : ''}`}
              onClick={() => setSelectedSubBracket('c_bracket')}
            >
              C조 (C Bracket)
            </button>
          )}
          <button
            className={`bracket-sec-btn ${selectedSubBracket === 'finals' ? 'active' : ''}`}
            onClick={() => setSelectedSubBracket('finals')}
          >
            최종 결승 (Finals)
          </button>
        </div>
      )}

      {/* Render bracket stages */}
      <div style={{ marginTop: '1.5rem' }}>
        {selectedSubBracket === 'all' ? (
          <>
            {renderSubBracket('winners', '🏆 승자조 (Winners Bracket)')}
            {hasLosersBracket && renderSubBracket('losers', '📉 패자조 (Losers Bracket)')}
            {hasCBracket && renderSubBracket('c_bracket', '🥉 C조 (C Bracket)')}
            {renderSubBracket('finals', '👑 최종 결승 (Finals)')}
          </>
        ) : (
          <>
            {selectedSubBracket === 'winners' && renderSubBracket('winners', '🏆 승자조 (Winners Bracket)')}
            {selectedSubBracket === 'losers' && renderSubBracket('losers', '📉 패자조 (Losers Bracket)')}
            {selectedSubBracket === 'c_bracket' && renderSubBracket('c_bracket', '🥉 C조 (C Bracket)')}
            {selectedSubBracket === 'finals' && renderSubBracket('finals', '👑 최종 결승 (Finals)')}
          </>
        )}
      </div>
    </div>
  );
};
