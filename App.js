import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from './supabase'; 

export default function App() {
  // --- AUTH & APP STATES ---
  const [session, setSession] = useState(null);
  const [username, setUsername] = useState('');
  const [screen, setScreen] = useState('menu'); // menu, game, leaderboard
  const [difficulty, setDifficulty] = useState(4); // Default to 4 digits

  // --- GAME STATES ---
  const [targetNumber, setTargetNumber] = useState(''); // String, not Int (to keep leading zeros like "0432")
  const [currentGuess, setCurrentGuess] = useState('');
  const [feedback, setFeedback] = useState('');
  const [guessesCount, setGuessesCount] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);
  const [gameTimer, setGameTimer] = useState(null);
  const [history, setHistory] = useState([]); // To show previous guesses

  // --- LEADERBOARD STATES ---
  const [leaders, setLeaders] = useState([]);
  const [leaderboardType, setLeaderboardType] = useState('time');
  const [loading, setLoading] = useState(false);

  // -------------------------
  // 1. AUTH SETUP
  // -------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else signInAnonymously();
    });
  }, []);

  const signInAnonymously = async () => {
    await supabase.auth.signInAnonymously();
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
  // 2. NEW GAME LOGIC (Place & Digit)
  // -------------------------
  
  // Generate X unique random digits
  const generateUniqueNumber = (length) => {
    let digits = [];
    while (digits.length < length) {
      const r = Math.floor(Math.random() * 10);
      if (!digits.includes(r)) {
        digits.push(r);
      }
    }
    return digits.join('');
  };

  const startGame = () => {
    if (!username) {
      Alert.alert("Name Required", "Please enter and SAVE your name first!");
      return;
    }
    
    const newTarget = generateUniqueNumber(difficulty);
    console.log("Secret Number (Dev Check):", newTarget); // Remove this before release!

    setTargetNumber(newTarget);
    setGuessesCount(0);
    setTimeTaken(0);
    setFeedback('Game Started! Timer running...');
    setCurrentGuess('');
    setHistory([]);
    setScreen('game');

    if (gameTimer) clearInterval(gameTimer);
    const timer = setInterval(() => {
      setTimeTaken(prev => prev + 1);
    }, 1000);
    setGameTimer(timer);
  };

  const handleGuess = () => {
    // 1. Validation
    if (currentGuess.length !== difficulty) {
      Alert.alert("Invalid Guess", `Please enter exactly ${difficulty} digits.`);
      return;
    }
    if (new Set(currentGuess).size !== currentGuess.length) {
      Alert.alert("Invalid Guess", "Digits must be UNIQUE (no repeats).");
      return;
    }

    const newCount = guessesCount + 1;
    setGuessesCount(newCount);

    // 2. Calculate Places & Digits
    let places = 0;
    let digits = 0;

    // Arrays for easier comparison
    const secretArr = targetNumber.split('');
    const guessArr = currentGuess.split('');

    // Check "Places" first (Correct Position)
    for (let i = 0; i < difficulty; i++) {
      if (guessArr[i] === secretArr[i]) {
        places++;
      }
    }

    // Check "Digits" (Wrong Position)
    for (let i = 0; i < difficulty; i++) {
      if (guessArr[i] !== secretArr[i] && secretArr.includes(guessArr[i])) {
        digits++;
      }
    }

    // 3. Feedback String
    const resultMsg = `${places} Place ${digits} Digit`;
    setFeedback(resultMsg);

    // Add to history (Newest on top)
    const newHistoryItem = { 
      id: newCount, 
      guess: currentGuess, 
      result: resultMsg 
    };
    setHistory([newHistoryItem, ...history]);

    // 4. Check Win
    if (places === difficulty) {
      clearInterval(gameTimer);
      setFeedback('YOU WON! 🎉');
      Alert.alert("Victory!", `Answer: ${targetNumber}\nTime: ${timeTaken}s\nGuesses: ${newCount}`, [
        { text: "Save Score", onPress: () => saveScore(newCount, timeTaken) }
      ]);
    }
    
    setCurrentGuess('');
  };

  const saveScore = async (guesses, time) => {
    setLoading(true);
    const { error } = await supabase
      .from('leaderboards')
      .insert([{ 
        user_id: session.user.id,
        difficulty: difficulty,
        time_seconds: time,
        guesses_count: guesses
      }]);
    setLoading(false);
    if (!error) fetchLeaderboard();
  };

  // -------------------------
  // 3. LEADERBOARD LOGIC
  // -------------------------
  const fetchLeaderboard = async () => {
    setScreen('leaderboard');
    setLoading(true);
    
    let query = supabase
      .from('leaderboards')
      .select(`
        difficulty, time_seconds, guesses_count,
        profiles!user_id (username)
      `)
      .eq('difficulty', difficulty)
      .limit(20);

    if (leaderboardType === 'time') {
      query = query.order('time_seconds', { ascending: true });
    } else {
      query = query.order('guesses_count', { ascending: true });
    }

    const { data } = await query;
    if (data) setLeaders(data);
    setLoading(false);
  };

  // -------------------------
  // 4. UI RENDERING
  // -------------------------
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PlaceNDigits</Text>
      </View>

      {/* === MENU === */}
      {screen === 'menu' && (
        <View style={styles.centerContent}>
          <Text style={styles.label}>Your Name:</Text>
          <View style={styles.rowInput}>
            <TextInput style={[styles.input, {flex:1}]} placeholder="Name" value={username} onChangeText={setUsername} />
            <TouchableOpacity style={styles.saveBtn} onPress={saveUsername}><Text style={styles.whiteText}>Save</Text></TouchableOpacity>
          </View>

          <Text style={styles.label}>Digits to Guess:</Text>
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
          <TouchableOpacity onPress={fetchLeaderboard} style={{marginTop:20}}>
            <Text style={{color: '#007AFF'}}>View Leaderboard</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* === GAME === */}
      {screen === 'game' && (
        <View style={styles.gameContainer}>
          <View style={styles.statsRow}>
            <Text style={styles.statText}>⏱ {timeTaken}s</Text>
            <Text style={styles.statText}>#️⃣ {guessesCount}</Text>
          </View>
          
          <Text style={styles.feedbackLarge}>{feedback}</Text>
          
          <View style={styles.inputSection}>
            <TextInput 
              style={styles.gameInput} 
              placeholder="Guess" 
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

          <TouchableOpacity style={styles.quitBtn} onPress={() => { clearInterval(gameTimer); setScreen('menu'); }}>
            <Text style={{color:'red'}}>Quit</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* === LEADERBOARD === */}
      {screen === 'leaderboard' && (
        <View style={styles.listContainer}>
          <Text style={styles.subTitle}>Top Players ({difficulty} Digits)</Text>
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
  header: { alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  centerContent: { padding: 20, alignItems: 'center' },
  label: { fontSize: 16, color: '#666', marginBottom: 8, alignSelf:'flex-start' },
  rowInput: { flexDirection: 'row', gap: 10, marginBottom: 20, width:'100%' },
  input: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, fontSize: 16 },
  saveBtn: { backgroundColor: '#333', padding: 12, borderRadius: 8, justifyContent:'center' },
  whiteText: { color: '#FFF', fontWeight: 'bold' },
  row: { flexDirection: 'row', gap: 15, marginBottom: 30 },
  diffButton: { padding: 15, backgroundColor: '#DDD', borderRadius: 50, width: 60, height:60, alignItems: 'center', justifyContent:'center' },
  activeDiff: { backgroundColor: '#007AFF' },
  diffText: { fontSize: 18, fontWeight:'bold' },
  activeText: { color: '#FFF' },
  startButton: { backgroundColor: '#28a745', paddingVertical: 15, paddingHorizontal: 50, borderRadius: 30 },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  // Game Styles
  gameContainer: { flex: 1, padding: 20, alignItems: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
  statText: { fontSize: 18, fontWeight: '600' },
  feedbackLarge: { fontSize: 24, fontWeight: 'bold', color: '#007AFF', marginBottom: 20 },
  inputSection: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  gameInput: { backgroundColor: '#FFF', fontSize: 24, width: 150, textAlign: 'center', padding: 10, borderRadius: 8, letterSpacing: 5 },
  guessBtn: { backgroundColor: '#007AFF', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 8 },
  historyList: { width: '100%', flex: 1 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 8 },
  histGuess: { fontSize: 18, fontWeight: 'bold', letterSpacing: 2 },
  histResult: { fontSize: 16, color: '#555' },
  quitBtn: { marginTop: 10, padding: 10 },
  // Leaderboard
  listContainer: { flex: 1, padding: 20 },
  subTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  tabRow: { flexDirection: 'row', marginBottom: 15 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderBottomWidth: 2, borderColor: '#DDD' },
  activeTab: { borderColor: '#007AFF' },
  scoreRow: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 8, alignItems: 'center' },
  rank: { fontWeight: 'bold', width: 30, color: '#666' },
  name: { flex: 1, fontSize: 16 },
  scoreVal: { fontWeight: 'bold', color: '#007AFF' },
  backButton: { backgroundColor: '#333', padding: 15, alignItems: 'center', borderRadius: 8, marginTop: 10 }
});