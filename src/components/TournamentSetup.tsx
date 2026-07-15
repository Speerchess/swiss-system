import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Play, 
  Sparkles, 
  Users,
  AlertTriangle
} from 'lucide-react';
import type { TournamentType, TiebreakType } from '../logic/types';

interface TournamentSetupProps {
  onStart: (
    name: string,
    type: TournamentType,
    players: Array<{ name: string; rating?: number }>,
    tiebreakOrder: TiebreakType[],
    settings: {
      pointsPerWin: number;
      pointsPerDraw: number;
      pointsPerLoss: number;
      pointsPerBye: number;
    }
  ) => void;
}

const TIEBREAK_NAMES: Record<TiebreakType, string> = {
  'buchholz': 'Buchholz (부흐홀츠 - 상대 점수 합)',
  'median-buchholz': 'Median Buchholz (미디언 부흐홀츠 - 최고/최저 제외 상대 점수 합)',
  'sonneborn-berger': 'Sonneborn-Berger (손네보른-베르거 - 이긴 상대 점수 + 비긴 상대 점수 0.5배)',
  'cumulative': 'Cumulative (누적 점수 - 라운드별 점수의 합)',
  'direct-encounter': 'Direct Encounter (승자승 - 승자 우선)',
  'rating': 'Rating (레이팅 - 본인 레이팅 우선)',
};

const DEFAULT_TIEBREAKS: TiebreakType[] = [
  'direct-encounter',
  'buchholz',
  'sonneborn-berger',
  'rating',
];

export const TournamentSetup: React.FC<TournamentSetupProps> = ({ onStart }) => {
  const [tournamentName, setTournamentName] = useState('체스 토너먼트');
  const [tournamentType, setTournamentType] = useState<TournamentType>('swiss');
  
  // Players state
  const [playersList, setPlayersList] = useState<Array<{ name: string; rating?: number }>>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerRating, setNewPlayerRating] = useState('');
  
  // Quick generate state
  const [quickCount, setQuickCount] = useState('8');
  
  // Bulk paste state
  const [bulkInput, setBulkInput] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);

  // Tiebreak order state
  const [tiebreakOrder, setTiebreakOrder] = useState<TiebreakType[]>(DEFAULT_TIEBREAKS);

  // Points settings
  const [winPoints, setWinPoints] = useState(1);
  const [drawPoints, setDrawPoints] = useState(0.5);
  const [lossPoints, setLossPoints] = useState(0);
  const [byePoints, setByePoints] = useState(1);

  // Error state
  const [error, setError] = useState('');

  // 1. Add single player
  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    const ratingVal = newPlayerRating.trim() ? parseInt(newPlayerRating, 10) : undefined;
    if (ratingVal !== undefined && isNaN(ratingVal)) {
      setError('레이팅은 숫자여야 합니다.');
      return;
    }

    setPlayersList([...playersList, { name: newPlayerName.trim(), rating: ratingVal }]);
    setNewPlayerName('');
    setNewPlayerRating('');
    setError('');
  };

  // 2. Remove player
  const handleRemovePlayer = (index: number) => {
    setPlayersList(playersList.filter((_, i) => i !== index));
  };

  // 3. Quick generate generic players by count
  const handleQuickGenerate = () => {
    const count = parseInt(quickCount, 10);
    if (isNaN(count) || count < 2) {
      setError('최소 2명 이상의 플레이어가 필요합니다.');
      return;
    }

    const generated: Array<{ name: string; rating?: number }> = [];
    for (let i = 1; i <= count; i++) {
      generated.push({ name: `플레이어 ${i}` });
    }
    setPlayersList(generated);
    setError('');
  };

  // 4. Parse and import bulk input (names and ratings)
  const handleBulkImport = () => {
    if (!bulkInput.trim()) return;

    const lines = bulkInput.split('\n');
    const parsed: Array<{ name: string; rating?: number }> = [];

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // Matches formats: "Name, Rating" or "Name (Rating)" or "Name"
      let name = cleanLine;
      let rating: number | undefined = undefined;

      // Pattern 1: comma separated
      if (cleanLine.includes(',')) {
        const parts = cleanLine.split(',');
        name = parts[0].trim();
        const ratingStr = parts[1]?.trim();
        if (ratingStr && !isNaN(parseInt(ratingStr, 10))) {
          rating = parseInt(ratingStr, 10);
        }
      }
      // Pattern 2: Name (Rating)
      else {
        const parentMatch = cleanLine.match(/^(.*?)\s*\((\d+)\)\s*$/);
        if (parentMatch) {
          name = parentMatch[1].trim();
          rating = parseInt(parentMatch[2], 10);
        }
      }

      parsed.push({ name, rating });
    });

    setPlayersList([...playersList, ...parsed]);
    setBulkInput('');
    setShowBulkInput(false);
    setError('');
  };

  // 5. Move tiebreaker rank
  const moveTiebreak = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...tiebreakOrder];
    if (direction === 'up' && index > 0) {
      const temp = newOrder[index];
      newOrder[index] = newOrder[index - 1];
      newOrder[index - 1] = temp;
    } else if (direction === 'down' && index < newOrder.length - 1) {
      const temp = newOrder[index];
      newOrder[index] = newOrder[index + 1];
      newOrder[index + 1] = temp;
    }
    setTiebreakOrder(newOrder);
  };

  const toggleTiebreakSelection = (type: TiebreakType) => {
    if (tiebreakOrder.includes(type)) {
      setTiebreakOrder(tiebreakOrder.filter((t) => t !== type));
    } else {
      setTiebreakOrder([...tiebreakOrder, type]);
    }
  };

  // 6. Submit and Start Tournament
  const handleStartTournament = () => {
    if (playersList.length < 2) {
      setError('토너먼트를 시작하려면 최소 2명의 플레이어가 등록되어야 합니다.');
      return;
    }

    // Validation for elimination tournament counts
    if (['single', 'double', 'triple'].includes(tournamentType)) {
      // It's recommended to warn about player count if not power of 2,
      // but our system automatically handles byes, so it is allowed!
    }

    onStart(
      tournamentName.trim() || '체스 토너먼트',
      tournamentType,
      playersList,
      tiebreakOrder,
      {
        pointsPerWin: winPoints,
        pointsPerDraw: drawPoints,
        pointsPerLoss: lossPoints,
        pointsPerBye: byePoints,
      }
    );
  };

  const unusedTiebreaks = (Object.keys(TIEBREAK_NAMES) as TiebreakType[]).filter(
    (type) => !tiebreakOrder.includes(type)
  );

  return (
    <div className="dashboard-grid">
      {/* Left side: Setup form and Player List */}
      <div className="glass-card">
        <h2 className="section-title">
          <Sparkles size={24} style={{ color: 'var(--color-secondary)' }} />
          대회 설정
        </h2>

        {error && (
          <div className="alert alert-warning">
            <AlertTriangle className="alert-icon" size={20} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="tournament-name">대회 이름</label>
          <input
            id="tournament-name"
            type="text"
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
            placeholder="예: 제1회 스위스 체스 오픈"
          />
        </div>

        <div className="form-group">
          <label>대회 방식</label>
          <div className="grid-options">
            <div 
              className={`option-card ${tournamentType === 'swiss' ? 'selected' : ''}`}
              onClick={() => setTournamentType('swiss')}
            >
              <div className="option-card-title">스위스 (Swiss)</div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                모든 라운드 참가, 비슷한 점수대 매칭
              </p>
            </div>
            <div 
              className={`option-card ${tournamentType === 'single' ? 'selected' : ''}`}
              onClick={() => setTournamentType('single')}
            >
              <div className="option-card-title">싱글 토너먼트</div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                지면 바로 탈락 (Knockout)
              </p>
            </div>
            <div 
              className={`option-card ${tournamentType === 'double' ? 'selected' : ''}`}
              onClick={() => setTournamentType('double')}
            >
              <div className="option-card-title">더블 토너먼트</div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                2패 시 최종 탈락 (패자조 운영)
              </p>
            </div>
            <div 
              className={`option-card ${tournamentType === 'triple' ? 'selected' : ''}`}
              onClick={() => setTournamentType('triple')}
            >
              <div className="option-card-title">트리플 토너먼트</div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                3패 시 최종 탈락
              </p>
            </div>
            <div 
              className={`option-card ${tournamentType === 'round-robin' ? 'selected' : ''}`}
              onClick={() => setTournamentType('round-robin')}
            >
              <div className="option-card-title">라운드 로빈</div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                풀리그 (모든 참가자와 한 번씩 경기)
              </p>
            </div>
          </div>
        </div>

        {/* Players setup section */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem' }}>
          <h3 className="section-title">
            <Users size={20} style={{ color: 'var(--color-primary)' }} />
            참가자 등록 ({playersList.length}명)
          </h3>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <button 
              className={`btn ${!showBulkInput ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowBulkInput(false)}
              type="button"
            >
              직접 추가
            </button>
            <button 
              className={`btn ${showBulkInput ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowBulkInput(true)}
              type="button"
            >
              여러 명 붙여넣기 / 자동 생성
            </button>
          </div>

          {!showBulkInput ? (
            <form onSubmit={handleAddPlayer} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                <label htmlFor="p-name">이름</label>
                <input
                  id="p-name"
                  type="text"
                  placeholder="예: 홍길동"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label htmlFor="p-rating">레이팅 (선택)</label>
                <input
                  id="p-rating"
                  type="number"
                  placeholder="예: 1500"
                  value={newPlayerRating}
                  onChange={(e) => setNewPlayerRating(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" type="submit" style={{ height: '42px' }}>
                <Plus size={18} />
                추가
              </button>
            </form>
          ) : (
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label>참가자 명단 입력 (줄바꿈으로 구분)</label>
                <textarea
                  placeholder="예시 1:&#10;홍길동, 1600&#10;김철수, 1450&#10;이영희&#10;&#10;예시 2:&#10;홍길동 (1600)&#10;김철수 (1450)"
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                />
                <button 
                  className="btn btn-primary" 
                  type="button" 
                  onClick={handleBulkImport}
                  style={{ marginTop: '0.5rem' }}
                >
                  가져오기
                </button>
              </div>

              <div className="form-group" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem', marginTop: '1rem' }}>
                <label>인원수로만 자동 생성</label>
                <div className="quick-generate-box">
                  <input
                    type="number"
                    value={quickCount}
                    onChange={(e) => setQuickCount(e.target.value)}
                    min="2"
                    placeholder="인원수 입력"
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-accent" type="button" onClick={handleQuickGenerate}>
                    자동 생성
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  입력한 인원수만큼 플레이어 1, 플레이어 2... 형태로 레이팅 없이 생성됩니다.
                </p>
              </div>
            </div>
          )}

          {/* List of current players */}
          {playersList.length > 0 ? (
            <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>번호</th>
                    <th>이름</th>
                    <th>레이팅</th>
                    <th style={{ textAlign: 'right' }}>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {playersList.map((player, idx) => (
                    <tr key={idx}>
                      <td style={{ width: '60px' }}>{idx + 1}</td>
                      <td style={{ fontWeight: '600' }}>{player.name}</td>
                      <td>{player.rating !== undefined ? player.rating : '-'}</td>
                      <td style={{ textAlign: 'right', width: '80px' }}>
                        <button
                          className="btn btn-danger btn-icon-only"
                          onClick={() => handleRemovePlayer(idx)}
                          type="button"
                          title="삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', border: '1px dashed var(--border-light)', borderRadius: 'var(--border-radius-md)' }}>
              등록된 플레이어가 없습니다. 참가자를 등록해 주세요.
            </div>
          )}
        </div>
      </div>

      {/* Right side: Tie-break order and Point systems */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Tie-breaks */}
        <div className="glass-card">
          <h3 className="section-title">순위 결정 기준 (타이브레이크)</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            점수가 동률일 때 순위를 가릴 기준들의 우선순위를 정합니다.
          </p>

          <div className="drag-list">
            {tiebreakOrder.map((type, idx) => (
              <div key={type} className="drag-item">
                <span style={{ fontWeight: '600' }}>
                  {idx + 1}. {TIEBREAK_NAMES[type].split(' (')[0]}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                    {TIEBREAK_NAMES[type].split(' (')[1]?.replace(')', '')}
                  </div>
                </span>
                <div className="drag-actions">
                  <button 
                    className="drag-btn" 
                    onClick={() => moveTiebreak(idx, 'up')}
                    disabled={idx === 0}
                    title="위로 이동"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button 
                    className="drag-btn" 
                    onClick={() => moveTiebreak(idx, 'down')}
                    disabled={idx === tiebreakOrder.length - 1}
                    title="아래로 이동"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button 
                    className="drag-btn" 
                    onClick={() => toggleTiebreakSelection(type)}
                    title="사용 안 함"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {unusedTiebreaks.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <label>추가 가능한 타이브레이크</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                {unusedTiebreaks.map((type) => (
                  <button
                    key={type}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                    onClick={() => toggleTiebreakSelection(type)}
                  >
                    + {TIEBREAK_NAMES[type].split(' (')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scoring settings */}
        <div className="glass-card">
          <h3 className="section-title">경기 점수 설정</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="win-pts">승리 승점</label>
              <input
                id="win-pts"
                type="number"
                step="0.5"
                value={winPoints}
                onChange={(e) => setWinPoints(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="draw-pts">무승부 승점</label>
              <input
                id="draw-pts"
                type="number"
                step="0.5"
                value={drawPoints}
                onChange={(e) => setDrawPoints(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="loss-pts">패배 승점</label>
              <input
                id="loss-pts"
                type="number"
                step="0.5"
                value={lossPoints}
                onChange={(e) => setLossPoints(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="bye-pts">부전승 승점</label>
              <input
                id="bye-pts"
                type="number"
                step="0.5"
                value={byePoints}
                onChange={(e) => setByePoints(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '2rem', height: '50px', fontSize: '1.1rem' }}
            onClick={handleStartTournament}
            disabled={playersList.length < 2}
          >
            <Play size={20} fill="white" />
            토너먼트 시작하기
          </button>
        </div>
      </div>
    </div>
  );
};
