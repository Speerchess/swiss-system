import type { Match, Player, MatchResult } from '../logic/types';
import { AlertCircle, Camera } from 'lucide-react';
import { toPng } from 'html-to-image';

interface PairingsViewProps {
  roundNumber: number;
  matches: Match[];
  players: Player[];
  onEnterResult: (matchId: string, result: MatchResult) => void;
  isCurrentRound: boolean;
  tournamentCompleted: boolean;
}

export const PairingsView: React.FC<PairingsViewProps> = ({
  roundNumber,
  matches,
  players,
  onEnterResult,
  isCurrentRound,
  tournamentCompleted,
}) => {
  const playerMap = new Map<string, Player>(players.map((p) => [p.id, p]));

  const getPlayerNameAndRating = (playerId: string | null) => {
    if (!playerId) return { name: 'BYE', rating: undefined };
    const player = playerMap.get(playerId);
    if (!player) return { name: '알 수 없음', rating: undefined };
    return { name: player.name, rating: player.rating };
  };

  const isRoundPending = matches.some((m) => m.status === 'pending');

  // Export pairings card to PNG
  const handleDownloadPNG = () => {
    const node = document.getElementById('pairings-card');
    if (!node) return;

    toPng(node, {
      cacheBust: true,
      backgroundColor: '#060913',
      style: {
        borderRadius: '0px',
      },
      filter: (domNode: any) => {
        // Exclude specific action elements like result input buttons or download buttons
        if (domNode.classList && (
          domNode.classList.contains('btn-download-png') || 
          domNode.classList.contains('result-buttons') ||
          domNode.innerText === '결과 수정'
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
      });
  };

  return (
    <div className="glass-card" id="pairings-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 className="section-title" style={{ marginBottom: 0 }}>
          {roundNumber} 라운드 대진
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
        <div className="pairings-list">
          {matches.map((match) => {
            const p1 = getPlayerNameAndRating(match.player1Id);
            const p2 = getPlayerNameAndRating(match.player2Id);
            const isBye = match.player2Id === null;

            return (
              <div 
                key={match.id} 
                className={`match-card ${isBye ? 'bye' : ''}`}
              >
                {/* Player 1 (White / Higher seed) */}
                <div className="player-box left">
                  <span className="player-name">{p1.name}</span>
                  {p1.rating !== undefined && (
                    <span className="player-rating">Rating: {p1.rating}</span>
                  )}
                  {!isBye && (
                    <span className="player-color-badge color-w">White</span>
                  )}
                </div>

                {/* Match Result Selector */}
                <div className="match-result-selector">
                  {isBye ? (
                    <span className="result-badge completed">부전승 (BYE)</span>
                  ) : (
                    <>
                      <div className="result-buttons">
                        <button
                          className={`btn-result ${
                            match.result === '1-0' ? 'selected' : ''
                          }`}
                          onClick={() =>
                            isCurrentRound && !tournamentCompleted && onEnterResult(match.id, '1-0')
                          }
                          disabled={!isCurrentRound || tournamentCompleted}
                          title="백 승리"
                        >
                          1 - 0
                        </button>
                        <button
                          className={`btn-result ${
                            match.result === '1/2-1/2' ? 'selected' : ''
                          }`}
                          onClick={() =>
                            isCurrentRound && !tournamentCompleted && onEnterResult(match.id, '1/2-1/2')
                          }
                          disabled={!isCurrentRound || tournamentCompleted}
                          title="무승부"
                        >
                          ½ - ½
                        </button>
                        <button
                          className={`btn-result ${
                            match.result === '0-1' ? 'selected' : ''
                          }`}
                          onClick={() =>
                            isCurrentRound && !tournamentCompleted && onEnterResult(match.id, '0-1')
                          }
                          disabled={!isCurrentRound || tournamentCompleted}
                          title="흑 승리"
                        >
                          0 - 1
                        </button>
                      </div>
                      
                      {isCurrentRound && !tournamentCompleted && match.status === 'completed' && (
                        <button
                          className="btn-result"
                          style={{ border: 'none', background: 'transparent', textDecoration: 'underline', fontSize: '0.7rem', padding: 0 }}
                          onClick={() => onEnterResult(match.id, null)}
                        >
                          결과 수정
                        </button>
                      )}

                      {match.status === 'pending' ? (
                        <span className="result-badge pending">진행 중</span>
                      ) : (
                        (tournamentCompleted || !isCurrentRound) && (
                          <span className="result-badge completed">
                            {match.result === '1-0' ? '백 승' : match.result === '0-1' ? '흑 승' : '무승부'}
                          </span>
                        )
                      )}
                    </>
                  )}
                </div>

                {/* Player 2 (Black / Lower seed) */}
                <div className="player-box right">
                  <span className="player-name">{p2.name}</span>
                  {p2.rating !== undefined && (
                    <span className="player-rating">Rating: {p2.rating}</span>
                  )}
                  {!isBye && (
                    <span className="player-color-badge color-b">Black</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
