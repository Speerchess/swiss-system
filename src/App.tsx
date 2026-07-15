import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  RotateCcw, 
  Download, 
  Upload, 
  CheckCircle,
  Crown,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import type { TournamentState, TournamentType, TiebreakType, Player, MatchResult, Round } from './logic/types';
import { TournamentSetup } from './components/TournamentSetup';
import { StandingsTable } from './components/StandingsTable';
import { PairingsView } from './components/PairingsView';
import { BracketView } from './components/BracketView';
import { generateSwissPairings } from './logic/swiss';
import { generateRoundRobin } from './logic/roundRobin';
import { 
  generateSingleElimination, 
  generateDoubleElimination, 
  generateTripleElimination,
  propagateEliminationResults 
} from './logic/elimination';
import { calculateTiebreaks } from './logic/tiebreaks';

const LOCAL_STORAGE_KEY = 'swiss_chess_tournament_state';

const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  'swiss': '스위스 시스템 (Swiss)',
  'single': '싱글 토너먼트 (Single Elimination)',
  'double': '더블 토너먼트 (Double Elimination)',
  'triple': '트리플 토너먼트 (Triple Elimination)',
  'round-robin': '라운드 로빈 (Round Robin)',
};

export default function App() {
  const [state, setState] = useState<TournamentState | null>(null);
  const [activeTab, setActiveTab] = useState<'pairings' | 'bracket'>('pairings');
  const [selectedRoundNum, setSelectedRoundNum] = useState<number>(1);
  const [fileError, setFileError] = useState('');

  // 1. Load state from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsedState = JSON.parse(saved) as TournamentState;
        setState(parsedState);
        setSelectedRoundNum(parsedState.currentRound || 1);
        
        // Default tab based on tournament type
        if (['single', 'double', 'triple'].includes(parsedState.type)) {
          setActiveTab('bracket');
        } else {
          setActiveTab('pairings');
        }
      } catch (e) {
        console.error('Failed to parse saved tournament state', e);
      }
    }
  }, []);

  // 2. Save state to LocalStorage when it changes
  useEffect(() => {
    if (state) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, [state]);

  const handleStartTournament = (
    name: string,
    type: TournamentType,
    setupPlayers: Array<{ name: string; rating?: number }>,
    tiebreakOrder: TiebreakType[],
    settings: TournamentState['settings']
  ) => {
    // Initialize players
    const initialPlayers: Player[] = setupPlayers.map((p, idx) => ({
      id: `player-${idx + 1}-${Math.random().toString(36).substr(2, 9)}`,
      name: p.name,
      rating: p.rating,
      score: 0,
      opponents: [],
      colors: [],
      byeReceived: false,
      active: true,
      tiebreaks: {
        buchholz: 0,
        medianBuchholz: 0,
        sonnebornBerger: 0,
        cumulative: 0,
        directEncounter: 0,
        rating: p.rating ?? 0,
      },
    }));

    let initialRounds: Round[] = [];

    // Generate initial round matches depending on type
    if (type === 'swiss') {
      const firstRoundMatches = generateSwissPairings(initialPlayers, 1, settings.pointsPerBye);
      initialRounds = [{
        roundNumber: 1,
        matches: firstRoundMatches,
        isCompleted: false,
      }];
    } else if (type === 'round-robin') {
      initialRounds = generateRoundRobin(initialPlayers);
    } else if (type === 'single') {
      initialRounds = generateSingleElimination(initialPlayers);
    } else if (type === 'double') {
      initialRounds = generateDoubleElimination(initialPlayers);
    } else if (type === 'triple') {
      initialRounds = generateTripleElimination(initialPlayers);
    }

    const newState: TournamentState = {
      id: `tournament-${Date.now()}`,
      name,
      type,
      players: calculateTiebreaks(initialPlayers, initialRounds, settings),
      rounds: initialRounds,
      currentRound: 1,
      tiebreakOrder,
      status: 'active',
      settings,
    };

    setState(newState);
    setSelectedRoundNum(1);
    setActiveTab(['single', 'double', 'triple'].includes(type) ? 'bracket' : 'pairings');
    setFileError('');
  };

  // 4. Enter Match Result
  const handleEnterResult = (matchId: string, result: MatchResult) => {
    if (!state) return;

    // Deep clone rounds
    const updatedRounds = state.rounds.map((round) => {
      const updatedMatches = round.matches.map((match) => {
        if (match.id === matchId) {
          const status: 'pending' | 'completed' = result !== null ? 'completed' : 'pending';
          return { ...match, result, status };
        }
        return match;
      });
      const isCompleted = updatedMatches.every((m) => m.status === 'completed');
      return { ...round, matches: updatedMatches, isCompleted };
    });

    let finalRounds = updatedRounds;
    
    // For elimination brackets, propagate the new result through the DAG
    if (['single', 'double', 'triple'].includes(state.type)) {
      finalRounds = propagateEliminationResults(updatedRounds, state.players);
    }

    // Recalculate standings and tiebreaks
    const updatedPlayers = calculateTiebreaks(state.players, finalRounds, state.settings);

    setState({
      ...state,
      rounds: finalRounds,
      players: updatedPlayers,
    });
  };

  // 5. Swiss Next Round Generation
  const handleGenerateNextRound = () => {
    if (!state) return;

    // Validate that all matches of current round are finished
    const currentRound = state.rounds.find((r) => r.roundNumber === state.currentRound);
    if (!currentRound || !currentRound.isCompleted) {
      alert('현재 라운드의 모든 경기 결과를 입력해야 다음 라운드로 진행할 수 있습니다.');
      return;
    }

    const nextRoundNumber = state.currentRound + 1;
    
    // Generate new pairings using latest standings
    const nextRoundMatches = generateSwissPairings(
      state.players,
      nextRoundNumber,
      state.settings.pointsPerBye
    );

    if (nextRoundMatches.length === 0) {
      alert('더 이상 대진을 짤 수 없습니다. 토너먼트를 종료해 주세요.');
      return;
    }

    const newRounds = [
      ...state.rounds,
      {
        roundNumber: nextRoundNumber,
        matches: nextRoundMatches,
        isCompleted: false,
      },
    ];

    setState({
      ...state,
      rounds: newRounds,
      currentRound: nextRoundNumber,
    });
    setSelectedRoundNum(nextRoundNumber);
    setActiveTab('pairings');
  };

  // 6. Withdraw or reinstate a player
  const handleTogglePlayerActive = (playerId: string) => {
    if (!state) return;

    const updatedPlayers = state.players.map((p) => {
      if (p.id === playerId) {
        return { ...p, active: !p.active };
      }
      return p;
    });

    setState({
      ...state,
      players: updatedPlayers,
    });
  };

  // 7. Finalize / Complete Tournament
  const handleFinishTournament = () => {
    if (!state) return;
    
    const confirmFinish = window.confirm('정말 토너먼트를 종료하시겠습니까? 종료 후에는 결과를 수정할 수 없습니다.');
    if (!confirmFinish) return;

    setState({
      ...state,
      status: 'completed',
    });
  };

  // 8. Reset and clear tournament
  const handleResetTournament = () => {
    const confirmReset = window.confirm('정말 대회를 초기화하시겠습니까? 저장된 모든 데이터가 삭제됩니다.');
    if (!confirmReset) return;

    setState(null);
    setSelectedRoundNum(1);
    setActiveTab('pairings');
    setFileError('');
  };

  // 9. Export tournament state as JSON file
  const handleExportJSON = () => {
    if (!state) return;
    const jsonStr = JSON.stringify(state, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.name.replace(/\s+/g, '_')}_data.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 10. Import tournament state from JSON file
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as TournamentState;
        if (!parsed.id || !parsed.name || !parsed.players || !parsed.rounds) {
          throw new Error('올바르지 않은 토너먼트 파일 구조입니다.');
        }
        setState(parsed);
        setSelectedRoundNum(parsed.currentRound || 1);
        setActiveTab(['single', 'double', 'triple'].includes(parsed.type) ? 'bracket' : 'pairings');
        setFileError('');
      } catch (err) {
        setFileError('파일을 읽는 중 에러가 발생했습니다. 올바른 토너먼트 백업 파일인지 확인해 주세요.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Check if current round has incomplete matches
  const currentRoundObj = state?.rounds.find(r => r.roundNumber === state.currentRound);
  const isCurrentRoundCompleted = currentRoundObj?.isCompleted ?? false;
  
  // For Round Robin, check if ALL rounds are finished
  const areAllRoundRobinRoundsCompleted = state?.type === 'round-robin' && state.rounds.every(r => r.isCompleted);
  
  // For Elimination, check if GF (and GF reset if exists) is completed
  const isEliminationFinished = ['single', 'double', 'triple'].includes(state?.type || '') && (() => {
    if (!state) return false;
    const finalRound = state.rounds[state.rounds.length - 1];
    return finalRound?.isCompleted;
  })();

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand">
          <Trophy size={32} className="brand-icon" />
          <h1 className="brand-name">Chess Pairings</h1>
        </div>
        <div className="header-actions">
          {state && (
            <>
              <button className="btn btn-secondary" onClick={handleExportJSON}>
                <Download size={16} />
                내보내기
              </button>
              <button className="btn btn-danger" onClick={handleResetTournament}>
                <RotateCcw size={16} />
                초기화
              </button>
            </>
          )}
          {!state && (
            <label className="btn btn-secondary" style={{ margin: 0 }}>
              <Upload size={16} />
              가져오기
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
      </header>

      {fileError && (
        <div className="alert alert-warning" style={{ marginBottom: '2rem' }}>
          <AlertTriangle className="alert-icon" size={20} />
          <span>{fileError}</span>
        </div>
      )}

      {/* Main Content Area */}
      {!state ? (
        <TournamentSetup onStart={handleStartTournament} />
      ) : (
        <div>
          {/* Active Tournament Banner */}
          <div 
            className="glass-card" 
            style={{ 
              marginBottom: '2rem', 
              padding: '1.5rem 2rem', 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              borderLeft: '4px solid var(--color-primary)',
              flexWrap: 'wrap',
              gap: '1rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span 
                  style={{ 
                    fontSize: '0.75rem', 
                    background: 'var(--color-primary-glow)', 
                    color: 'var(--color-primary-hover)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '50px',
                    fontWeight: 700
                  }}
                >
                  {TOURNAMENT_TYPE_LABELS[state.type]}
                </span>
                {state.status === 'completed' && (
                  <span 
                    style={{ 
                      fontSize: '0.75rem', 
                      background: 'var(--color-success-bg)', 
                      color: 'var(--color-success-hover)',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '50px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <Crown size={12} />
                    종료됨
                  </span>
                )}
              </div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{state.name}</h2>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ textAlign: 'right', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <div>참가자: <strong>{state.players.length}명</strong></div>
                {state.type === 'swiss' && (
                  <div>라운드: <strong>{state.currentRound} Rd</strong></div>
                )}
              </div>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="tabs">
            {state.type !== 'single' && state.type !== 'double' && state.type !== 'triple' && (
              <button
                className={`tab-btn ${activeTab === 'pairings' ? 'active' : ''}`}
                onClick={() => setActiveTab('pairings')}
              >
                대진 및 결과 입력
              </button>
            )}
            
            {['single', 'double', 'triple'].includes(state.type) && (
              <>
                <button
                  className={`tab-btn ${activeTab === 'bracket' ? 'active' : ''}`}
                  onClick={() => setActiveTab('bracket')}
                >
                  대진표 (Bracket Visualizer)
                </button>
                <button
                  className={`tab-btn ${activeTab === 'pairings' ? 'active' : ''}`}
                  onClick={() => setActiveTab('pairings')}
                >
                  라운드별 리스트
                </button>
              </>
            )}
          </div>

          {/* Dashboard Grid */}
          <div className="dashboard-grid">
            {/* Left side: Pairings / Bracket View */}
            <div>
              {activeTab === 'pairings' ? (
                <div>
                  {/* Round selection for Swiss / Round Robin */}
                  <div className="tabs" style={{ gap: '0.25rem' }}>
                    {state.rounds.map((round) => (
                      <button
                        key={round.roundNumber}
                        className={`tab-btn ${
                          selectedRoundNum === round.roundNumber ? 'active' : ''
                        }`}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={() => setSelectedRoundNum(round.roundNumber)}
                      >
                        {round.roundNumber} Rd
                      </button>
                    ))}
                  </div>

                  <PairingsView
                    roundNumber={selectedRoundNum}
                    matches={state.rounds.find((r) => r.roundNumber === selectedRoundNum)?.matches || []}
                    players={state.players}
                    onEnterResult={handleEnterResult}
                    isCurrentRound={
                      state.type === 'swiss' 
                        ? selectedRoundNum === state.currentRound 
                        : true // Elimination and Round Robin allow editing all rounds
                    }
                    tournamentCompleted={state.status === 'completed'}
                  />

                  {/* Next Round controls */}
                  {state.status === 'active' && (
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                      {state.type === 'swiss' && selectedRoundNum === state.currentRound && (
                        <button
                          className="btn btn-primary"
                          onClick={handleGenerateNextRound}
                          disabled={!isCurrentRoundCompleted}
                        >
                          <Calendar size={18} />
                          다음 라운드 대진 생성
                        </button>
                      )}

                      {/* Finish Tournament button conditions */}
                      {((state.type === 'swiss' && isCurrentRoundCompleted) ||
                        (state.type === 'round-robin' && areAllRoundRobinRoundsCompleted) ||
                        (['single', 'double', 'triple'].includes(state.type) && isEliminationFinished)) && (
                        <button
                          className="btn btn-accent"
                          onClick={handleFinishTournament}
                        >
                          <CheckCircle size={18} />
                          대회 최종 종료
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <BracketView
                    rounds={state.rounds}
                    players={state.players}
                    type={state.type as 'single' | 'double' | 'triple'}
                  />
                  {state.status === 'active' && isEliminationFinished && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-accent"
                        onClick={handleFinishTournament}
                      >
                        <CheckCircle size={18} />
                        대회 최종 종료
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right side: Standings */}
            <div>
              <StandingsTable
                players={state.players}
                tiebreakOrder={state.tiebreakOrder}
                rounds={state.rounds}
                onTogglePlayerActive={
                  state.status === 'active' && state.type === 'swiss'
                    ? handleTogglePlayerActive
                    : undefined
                }
                isCompleted={state.status === 'completed'}
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <p>
          &copy; {new Date().getFullYear()} Chess Pairings Manager | Built for organizers and players.
        </p>
      </footer>
    </div>
  );
}
