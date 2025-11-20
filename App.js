import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { supabase } from './supabase'; 

export default function App() {
  // --- AUTH & APP STATES ---
  const [session, setSession] = useState(null);
  const [username, setUsername] = useState('');
  const [screen, setScreen] = useState('menu'); // menu, game, leaderboard
  const [difficulty, setDifficulty] = useState(4);

  // --- GAME STATES ---
  const [targetNumber, setTargetNumber] = useState('');
  const [currentGuess, setCurrentGuess] = useState('');
  const [feedback, setFeedback] = useState('');
  const [guessesCount, setGuessesCount] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);
  const [gameTimer, setGameTimer] = useState(null);
  const [history, setHistory] = useState([]); // Current game guesses
  const [isGameWon, setIsGameWon] = useState(false); // New state for UI switching

  // --- DATA STATES ---
  const [myHistory, setMyHistory] = useState([]); // Past games on Home Screen
  const [leaders, setLeaders] = useState([]);
  const [leaderboardType, setLeaderboardType] = useState('time');
  const [loading, setLoading] = useState(false);

  // -------------------------
  // 1. INITIAL SETUP
  // -------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchMyHistory(session.user.id); // Load history on start
      } else {
        signInAnonymously();
      }
    });
  }, []);

  const signInAnonymously = async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (data?.session) {
      setSession(data.session);
      fetchMyHistory(data.session.user.id);
    }
  };

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('username').eq('id', userId).single();
    if (data) setUsername(data.username);
  };

  const saveUsername = async () => {
    if (!session || !username.trim()) return;
    const { error } = await supabase.from('profiles').upsert({ id: session.user.id, username: username });
    if (!error) Alert.alert("Success", "Name saved!");
  };

  // -------------------------
  // 2. DATA FETCHING (History & Leaders)
  // -------------------------
  const fetchMyHistory = async (userId = session?.user?.id) => {
    if (!userId) return;
    const { data } = await supabase
      .from('leaderboards')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10); // Last 10 games
    if (data) setMyHistory(data);
  };

  const fetchLeaderboard = async () => {
    setScreen('leaderboard');
    setLoading(true);
    let query = supabase
      .from('leaderboards')
      .select(`difficulty, time_seconds, guesses_count, profiles!user_id (username)`)
      .eq('difficulty', difficulty)
      .limit(20);

    if (leaderboardType === 'time') query = query.order('time_seconds', { ascending: true });
    else query = query.order('guesses_count', { ascending: true });

    const { data } = await query;
    if (data) setLeaders(data);
    setLoading(false);
  };

  // -------------------------
  // 3. GAME LOGIC
  // -------------------------
  const generateUniqueNumber = (length) => {
    let digits = [];
    while (digits.length < length) {
      const r = Math.floor(Math.random() * 10);
      if (!digits.includes(r)) digits.push(r);
    }
    return digits.join('');
  };

  const startGame = () => {
    if (!username) {
      Alert.alert("Name Required", "Please save your name first!");
      return;
    }
    const newTarget = generateUniqueNumber(difficulty);
    console.log("Secret:", newTarget); 

    setTargetNumber(newTarget);
    setGuessesCount(0);
    setTimeTaken(0);
    setFeedback('Timer Running...');
    setCurrentGuess('');
    setHistory([]);
    setIsGameWon(false);
    setScreen('game');

    if (gameTimer) clearInterval(gameTimer);
    const timer = setInterval(() => setTimeTaken(prev => prev + 1), 1000);
    setGameTimer(timer);
  };

  const handleGuess = () => {
    // Validation
    if (currentGuess.length !== difficulty) {
      Alert.alert("Invalid", `Enter ${difficulty} digits.`);
      return;
    }
    if (new Set(currentGuess).size !== currentGuess.length) {
      Alert.alert("Invalid", "Digits must be UNIQUE.");
      return;
    }

    const newCount = guessesCount + 1;
    setGuessesCount(newCount);

    // Logic (Place & Digit)
    let places = 0;
    let digits = 0;
    const secretArr = targetNumber.split('');
    const guessArr = currentGuess.split('');

    for (let i = 0; i < difficulty; i++) {
      if (guessArr[i] === secretArr[i]) places++;
      else if (secretArr.includes(guessArr[i])) digits++;
    }

    const resultMsg = `${places} Place  ${digits} Digit`;
    setFeedback(resultMsg);
    setHistory([{ id: newCount, guess: currentGuess, result: resultMsg }, ...history]);
    setCurrentGuess('');

    // WIN CONDITION
    if (places === difficulty) {
      clearInterval(gameTimer);
      setFeedback('🎉 YOU WON! 🎉');
      setIsGameWon(true); // Switches UI to "Result Mode"
      saveScore(newCount, timeTaken); // Auto Save
    }
  };

  // AUTO SAVE FUNCTION
  const saveScore = async (guesses, time) => {
    await supabase.from('leaderboards').insert([{ 
        user_id: session.user.id,
        difficulty: difficulty,
        time_seconds: time,
        guesses_count: guesses
      }]);
    // Refresh my history so it shows up when we go back to Home
    fetchMyHistory(); 
  };

  // -------------------------
  // 4. UI RENDER
  // -------------------------
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PlaceNDigits</Text>
      </View>

      {/* === MENU SCREEN === */}
      {screen === 'menu' && (
        <View style={styles.mainContainer}>
          {/* Top Section: Inputs */}
          <View style={styles.menuSection}>
            <Text style={styles.label}>Player Name</Text>
            <View style={styles.rowInput}>
              <TextInput style={[styles.input, {flex:1}]} placeholder="Name" value={username} onChangeText={setUsername} />
              <TouchableOpacity style={styles.miniBtn} onPress={saveUsername}><Text style={styles.whiteText}>Save</Text></TouchableOpacity>
            </View>

            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.row}>
              {[3, 4, 5].map(num => (
                <TouchableOpacity key={num} style={[styles.diffButton, difficulty === num && styles.activeDiff]} onPress={() => setDifficulty(num)}>
                  <Text style={[styles.diffText, difficulty === num && styles.activeText]}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.startButton} onPress={startGame}>
              <Text style={styles.btnText}>Start Game</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={fetchLeaderboard} style={{marginTop: 15}}>
              <Text style={styles.linkText}>View Global Leaderboard</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Section: My History */}
          <View style={styles.historySection}>
            <Text style={styles.subTitle}>My Recent Games</Text>
            <FlatList 
              data={myHistory}
              keyExtractor={item => item.id.toString()}
              renderItem={({item}) => (
                <View style={styles.historyCard}>
                  <Text style={styles.historyCardText}>Dig: {item.difficulty}</Text>
                  <Text style={styles.historyCardText}>⏳ {item.time_seconds}s</Text>
                  <Text style={styles.historyCardText}>#️⃣ {item.guesses_count}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={{textAlign:'center', color:'#999'}}>No games played yet.</Text>}
            />
          </View>
        </View>
      )}

      {/* === GAME SCREEN === */}
      {screen === 'game' && (
        <View style={styles.gameContainer}>
          <View style={styles.statsRow}>
            <Text style={styles.statText}>⏳ {timeTaken}s</Text>
            <Text style={styles.statText}>#️⃣ {guessesCount}</Text>
          </View>
          
          <Text style={[styles.feedbackLarge, isGameWon && {color: 'green'}]}>{feedback}</Text>
          
          {!isGameWon ? (
            // PLAYING MODE
            <View style={styles.inputSection}>
              <TextInput 
                style={styles.gameInput} 
                placeholder="?" 
                keyboardType="numeric"
                maxLength={difficulty}
                value={currentGuess}
                onChangeText={setCurrentGuess}
                onSubmitEditing={handleGuess}
                autoFocus
              />
              <TouchableOpacity style={styles.guessBtn} onPress={handleGuess}>
                <Text style={styles.btnText}>Go</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // GAME OVER MODE (Buttons Only)
            <View style={styles.gameOverRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={startGame}>
                <Text style={styles.btnText}>Play Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#555'}]} onPress={() => setScreen('menu')}>
                <Text style={styles.btnText}>Home</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Current Round Guess History */}
          <FlatList
            data={history}
            keyExtractor={item => item.id.toString()}
            style={styles.historyList}
            renderItem={({ item }) => (
              <View style={styles.historyRow}>
                <Text style={styles.histGuess}>{item.guess}</Text>
                <Text style={styles.histResult}>{item.result}</Text>
              </View>
            )}
          />

          {!isGameWon && (
            <TouchableOpacity style={styles.quitBtn} onPress={() => { clearInterval(gameTimer); setScreen('menu'); }}>
              <Text style={{color:'red'}}>Quit Game</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* === LEADERBOARD SCREEN === */}
      {screen === 'leaderboard' && (
        <View style={styles.listContainer}>
          <Text style={styles.subTitle}>Global Top 20 ({difficulty} Digits)</Text>
          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tab, leaderboardType === 'time' && styles.activeTab]} onPress={() => { setLeaderboardType('time'); fetchLeaderboard(); }}>
              <Text>Fastest</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, leaderboardType === 'guesses' && styles.activeTab]} onPress={() => { setLeaderboardType('guesses'); fetchLeaderboard(); }}>
              <Text>Fewest Tries</Text>
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator /> : (
            <FlatList
              data={leaders}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <View style={styles.scoreRow}>
                  <Text style={styles.rank}>#{index + 1}</Text>
                  <Text style={styles.name}>{item.profiles ? item.profiles.username : 'Anon'}</Text>
                  <Text style={styles.scoreVal}>{leaderboardType === 'time' ? `${item.time_seconds}s` : `${item.guesses_count}`}</Text>
                </View>
              )}
            />
          )}
          <TouchableOpacity style={styles.backButton} onPress={() => setScreen('menu')}>
            <Text style={styles.whiteText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5', paddingTop: 60 },
  mainContainer: { flex: 1, paddingHorizontal: 20 },
  header: { alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  
  // Menu
  menuSection: { alignItems: 'center', marginBottom: 20 },
  historySection: { flex: 1, borderTopWidth: 1, borderColor: '#DDD', paddingTop: 10 },
  label: { fontSize: 14, color: '#666', marginBottom: 5, alignSelf:'flex-start' },
  rowInput: { flexDirection: 'row', gap: 10, marginBottom: 15, width:'100%' },
  input: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, fontSize: 16 },
  miniBtn: { backgroundColor: '#333', padding: 12, borderRadius: 8, justifyContent:'center' },
  whiteText: { color: '#FFF', fontWeight: 'bold' },
  row: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  diffButton: { padding: 10, backgroundColor: '#DDD', borderRadius: 50, width: 50, height:50, alignItems: 'center', justifyContent:'center' },
  activeDiff: { backgroundColor: '#007AFF' },
  diffText: { fontSize: 18, fontWeight:'bold' },
  activeText: { color: '#FFF' },
  startButton: { backgroundColor: '#28a745', paddingVertical: 15, width: '100%', alignItems:'center', borderRadius: 10 },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  linkText: { color: '#007AFF', fontSize: 16 },

  // History Cards
  subTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#444' },
  historyCard: { flexDirection: 'row', justifyContent:'space-between', backgroundColor: '#FFF', padding: 12, borderRadius: 8, marginBottom: 8 },
  historyCardText: { fontSize: 14, color: '#333', fontWeight:'600' },

  // Game
  gameContainer: { flex: 1, padding: 20, alignItems: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
  statText: { fontSize: 18, fontWeight: '600' },
  feedbackLarge: { fontSize: 22, fontWeight: 'bold', color: '#007AFF', marginBottom: 20 },
  inputSection: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  gameInput: { backgroundColor: '#FFF', fontSize: 24, width: 150, textAlign: 'center', padding: 10, borderRadius: 8, letterSpacing: 5 },
  guessBtn: { backgroundColor: '#007AFF', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8 },
  gameOverRow: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  actionBtn: { backgroundColor: '#28a745', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, minWidth: 120, alignItems:'center' },
  historyList: { width: '100%', flex: 1 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 8 },
  histGuess: { fontSize: 18, fontWeight: 'bold', letterSpacing: 2 },
  histResult: { fontSize: 16, color: '#555' },
  quitBtn: { marginTop: 10, padding: 10 },

  // Leaderboard
  listContainer: { flex: 1, padding: 20 },
  tabRow: { flexDirection: 'row', marginBottom: 15 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderBottomWidth: 2, borderColor: '#DDD' },
  activeTab: { borderColor: '#007AFF' },
  scoreRow: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 8, alignItems: 'center' },
  rank: { fontWeight: 'bold', width: 30, color: '#666' },
  name: { flex: 1, fontSize: 16 },
  scoreVal: { fontWeight: 'bold', color: '#007AFF' },
  backButton: { backgroundColor: '#333', padding: 15, alignItems: 'center', borderRadius: 8, marginTop: 10 }
});