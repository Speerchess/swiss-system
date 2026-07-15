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
  const [selectedSubBracket, setSelectedSubBracket] = useState<'winners' | 'losers' | 'c_bracket' | 'finals'>('winners');
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

  // Filter matches belonging to the selected sub-bracket
  const getFilteredMatchesForRound = (roundMatches: Match[]) => {
    return (roundMatches as MatchWithSources[]).filter((m) => {
      const bType = m.bracketType;
      
      if (selectedSubBracket === 'winners') {
        return bType === 'winners';
      }
      if (selectedSubBracket === 'losers') {
        return bType === 'losers';
      }
      if (selectedSubBracket === 'c_bracket') {
        return bType === 'c_bracket';
      }
      if (selectedSubBracket === 'finals') {
        return bType === 'grand_final' || bType === 'grand_final_reset';
      }
      return false;
    });
  };

  // Check which sub-brackets have any matches
  const hasLosersBracket = type === 'double' || type === 'triple';
  const hasCBracket = type === 'triple';

  // Group rounds that actually contain matches for the selected sub-bracket
  const activeRounds = rounds
    .map((r) => ({
      ...r,
      matches: getFilteredMatchesForRound(r.matches),
    }))
    .filter((r) => r.matches.length > 0);

  // Export bracket card to PNG
  const handleDownloadPNG = () => {
    const node = document.getElementById('bracket-card');
    if (!node) return;

    const bracketOuter = node.querySelector('.bracket-outer') as HTMLElement;
    const bracketContainer = node.querySelector('.bracket-container') as HTMLElement;

    // Expand to fit full scrollable width of the bracket during capture
    const scrollWidth = bracketContainer ? bracketContainer.scrollWidth : node.scrollWidth;
    const fullWidth = Math.max(node.clientWidth, scrollWidth + 48);
    const fullHeight = node.scrollHeight;

    const originalOverflow = bracketOuter ? bracketOuter.style.overflow : '';
    const originalWidth = bracketOuter ? bracketOuter.style.width : '';
    const originalNodeWidth = node.style.width;
    const originalNodeMaxWidth = node.style.maxWidth;

    if (bracketOuter) {
      bracketOuter.style.overflow = 'visible';
      bracketOuter.style.width = 'auto';
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
        if (bracketOuter) {
          bracketOuter.style.overflow = originalOverflow;
          bracketOuter.style.width = originalWidth;
        }
        node.style.width = originalNodeWidth;
        node.style.maxWidth = originalNodeMaxWidth;
      });
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

      {activeRounds.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          선택한 조의 경기가 아직 생성되지 않았거나 없습니다.
        </div>
      ) : (
        <div className="bracket-outer">
          <div className="bracket-container">
            {activeRounds.map((round) => (
              <div key={round.roundNumber} className="bracket-round">
                <div className="bracket-round-title">
                  {selectedSubBracket === 'finals' 
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
      )}
    </div>
  );
};
