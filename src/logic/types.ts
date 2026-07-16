export type TournamentType = 'swiss' | 'single' | 'double' | 'triple' | 'round-robin';

export type TiebreakType =
  | 'buchholz'
  | 'median-buchholz'
  | 'buchholz-cut1'
  | 'buchholz-second'
  | 'sonneborn-berger'
  | 'cumulative'
  | 'direct-encounter'
  | 'black-wins'
  | 'rating';

export type MatchResult = '1-0' | '0-1' | '1/2-1/2' | '0-0' | null;

export interface Player {
  id: string;
  name: string;
  rating?: number;
  score: number;
  opponents: string[]; // List of opponent player IDs played against
  colors: ('W' | 'B' | 'BYE')[]; // History of colors played ('W' for White, 'B' for Black, 'BYE' for bye)
  byeReceived: boolean;
  active: boolean; // False if withdrawn from tournament
  tiebreaks: {
    buchholz: number;
    medianBuchholz: number;
    buchholzCut1: number;
    buchholzSecond: number;
    sonnebornBerger: number;
    cumulative: number;
    directEncounter: number;
    blackWins: number;
    rating: number;
  };
}

export interface Match {
  id: string;
  round: number;
  player1Id: string; // Typically White (or high seed)
  player2Id: string | null; // Typically Black (or low seed) - null represents a bye
  result: MatchResult; // null if not played yet
  status: 'pending' | 'completed';
  bracketType?: 'winners' | 'losers' | 'c_bracket' | 'grand_final' | 'grand_final_reset'; // for elimination
}

export interface Round {
  roundNumber: number;
  matches: Match[];
  isCompleted: boolean;
}

export interface TournamentState {
  id: string;
  name: string;
  type: TournamentType;
  players: Player[];
  rounds: Round[];
  currentRound: number;
  tiebreakOrder: TiebreakType[];
  status: 'setup' | 'active' | 'completed';
  settings: {
    pointsPerWin: number;
    pointsPerDraw: number;
    pointsPerLoss: number;
    pointsPerBye: number;
  };
}
