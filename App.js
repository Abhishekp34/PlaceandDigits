import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar, Keyboard, InputAccessoryView } from 'react-native';
import { supabase } from './supabase'; 
import ConfettiCannon from 'react-native-confetti-cannon'; 
import * as Haptics from 'expo-haptics'; 

const THEME = {
  bg: '#121212', card: '#1E1E1E', text: '#FFFFFF', textDim: '#AAAAAA', 
  primary: '#0A84FF', success: '#30D158', danger: '#FF453A', inputBg: '#2C2C2E',
  gold: '#FFD700' 
};

export default function App() {
  const [session, setSession] = useState(null);
  const [username, setUsername] = useState('');
  const [hasSavedName, setHasSavedName] = useState(false);
  const [screen, setScreen] = useState('menu'); 
  const [difficulty, setDifficulty] = useState(4);
  const [targetNumber, setTargetNumber] = useState('');
  const [currentGuess, setCurrentGuess] = useState('');
  const [feedback, setFeedback] = useState('');
  const [guessesCount, setGuessesCount] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);
  const [gameTimer, setGameTimer] = useState(null);
  const [history, setHistory] = useState([]); 
  const [isGameWon, setIsGameWon] = useState(false);
  const [myHistory, setMyHistory] = useState([]); 
  const [leaders, setLeaders] = useState([]);
  const [leaderboardType, setLeaderboardType] = useState('time'); 
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        fetchMyHistory(session.user.id); 
      } else {
        signInAnonymously();
      }
    });
  }, []);

  const signInAnonymously = async () => {
    const { data } = await supabase.auth.signInAnonymously();
    if (data?.session) {
      setSession(data.session);
      fetchMyHistory(data.session.user.id);
    }
  };

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('username').eq('id', userId).single();
    if (data && data.username) {
      setUsername(data.username);
      setHasSavedName(true);
    }
  };

  // --- UPDATED: Now returns detailed error types ---
  const saveUsername = async () => {
    if (!session || !username.trim()) return { success: false, error: 'empty' };
    
    const { error } = await supabase.from('profiles').upsert({ id: session.user.id, username: username });
    
    if (error) {
      // Postgres Error 23505 = Unique Violation (Duplicate Key)
      if (error.code === '23505' || error.message.includes('unique constraint')) {
        return { success: false, error: 'duplicate' };
      }
      console.log("Supabase Error:", error.message);
      return { success: false, error: 'generic' };
    }
    
    setHasSavedName(true);
    return { success: true };
  };

  const fetchMyHistory = async (userId = session?.user?.id) => {
    if (!userId) return;
    const { data } = await supabase.from('leaderboards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10); 
    if (data) setMyHistory(data);
  };

  const fetchLeaderboard = async (selectedType) => {
    const sortType = (typeof selectedType === 'string') ? selectedType : leaderboardType;
    setScreen('leaderboard');
    setLoading(true);
    let query = supabase.from('leaderboards').select(`difficulty, time_seconds, guesses_count, profiles!user_id (username)`).eq('difficulty', difficulty);
    if (sortType === 'time') query = query.order('time_seconds', { ascending: true });
    else query = query.order('guesses_count', { ascending: true });
    const { data } = await query.limit(20);
    if (data) setLeaders(data);
    setLoading(false);
  };

  const generateUniqueNumber = (length) => {
    let digits = [];
    while (digits.length < length) {
      const r = Math.floor(Math.random() * 10);
      if (!digits.includes(r)) digits.push(r);
    }
    return digits.join('');
  };

  // --- UPDATED START GAME LOGIC ---
  const startGame = async () => {
    // 1. Check if name is empty
    if (!username.trim()) { 
      Alert.alert("Name Required", "Please enter your name to start!"); 
      return; 
    }

    // 2. Auto-Save Logic (Background)
    if (!hasSavedName) {
      const result = await saveUsername();
      
      if (!result.success) {
         // HANDLE SPECIFIC ERRORS HERE
         if (result.error === 'duplicate') {
           Alert.alert("Username Taken", "That name is already taken. Please choose another one.");
         } else {
           Alert.alert("Error", "Could not save name. Check connection.");
         }
         return;
      }
    }

    // 3. Start Game
    const newTarget = generateUniqueNumber(difficulty);
    console.log("Secret:", newTarget); 
    setTargetNumber(newTarget);
    setGuessesCount(0);
    setTimeTaken(0);
    setFeedback('Good Luck!');
    setCurrentGuess('');
    setHistory([]);
    setIsGameWon(false);
    setScreen('game');
    if (gameTimer) clearInterval(gameTimer);
    const timer = setInterval(() => setTimeTaken(prev => prev + 1), 1000);
    setGameTimer(timer);
  };

  const handleGuess = async () => {
    if (currentGuess.length !== difficulty) { 
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); 
      Alert.alert("Invalid", `Enter ${difficulty} digits.`); 
      return; 
    }
    if (new Set(currentGuess).size !== currentGuess.length) { 
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); 
      Alert.alert("Invalid", "Digits must be UNIQUE."); 
      return; 
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newCount = guessesCount + 1;
    setGuessesCount(newCount);

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

    if (places === difficulty) {
      clearInterval(gameTimer);
      setIsGameWon(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      saveScore(newCount, timeTaken);
      Keyboard.dismiss(); 
    }
  };

  const saveScore = async (guesses, time) => {
    await supabase.from('leaderboards').insert([{ user_id: session.user.id, difficulty: difficulty, time_seconds: time, guesses_count: guesses }]);
    fetchMyHistory(); 
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" /> 

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID="GuessAccessory">
          <View style={styles.accessoryBar}>
            <TouchableOpacity style={styles.accessoryButton} onPress={handleGuess}>
              <Text style={styles.accessoryText}>SUBMIT GUESS</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      {isGameWon && (
        <ConfettiCannon count={200} origin={{x: -10, y: 0}} fadeOut={true} />
      )}

      <View style={styles.header}>
        <Text style={styles.title}>PlaceNDigits</Text>
      </View>

      {screen === 'menu' && (
        <View style={styles.mainContainer}>
          <View style={styles.welcomeSection}>
            {hasSavedName ? (
              <View style={styles.nameDisplayRow}>
                <Text style={styles.welcomeText}>Welcome, <Text style={styles.usernameHighlight}>{username}</Text></Text>
                <TouchableOpacity onPress={() => setHasSavedName(false)}><Text style={styles.editLink}>Edit</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameInputRow}>
                <TextInput 
                  style={styles.input} 
                  placeholder="Enter your Name" 
                  placeholderTextColor="#777" 
                  value={username} 
                  onChangeText={setUsername} 
                />
              </View>
            )}
          </View>

          <View style={styles.menuSection}>
            <Text style={styles.label}>Select Difficulty</Text>
            <View style={styles.diffRow}>
              {[3, 4, 5].map(num => (
                <TouchableOpacity key={num} style={[styles.diffButton, difficulty === num && styles.activeDiff]} onPress={() => setDifficulty(num)}>
                  <Text style={[styles.diffText, difficulty === num && styles.activeText]}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.startButton} onPress={startGame}><Text style={styles.btnText}>Start Game</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setLeaderboardType('time'); fetchLeaderboard('time'); }} style={{marginTop: 20}}>
              <Text style={styles.linkText}>View Global Leaderboard</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.historySection}>
            <Text style={styles.subTitle}>My Recent Games</Text>
            <FlatList 
              data={myHistory}
              keyExtractor={item => item.id.toString()}
              renderItem={({item}) => (
                <View style={styles.historyCard}>
                  <View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{item.difficulty}</Text></View>
                  <Text style={styles.historyCardText}>⏳ {item.time_seconds}s</Text>
                  <Text style={styles.historyCardText}>#️⃣ {item.guesses_count}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={{textAlign:'center', color:'#666', marginTop: 20}}>No games played yet.</Text>}
            />
          </View>
        </View>
      )}

      {screen === 'game' && (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.gameContainer}>
          
          {!isGameWon ? (
            <>
              <View style={styles.statsRow}>
                <Text style={styles.statText}>⏳ {timeTaken}s</Text>
                <Text style={styles.statText}>#️⃣ {guessesCount}</Text>
              </View>
              
              <Text style={styles.feedbackLarge}>{feedback}</Text>
              
              <View style={styles.inputSection}>
                <TextInput 
                  style={styles.gameInput} 
                  placeholder="?" placeholderTextColor="#555" keyboardType="numeric"
                  maxLength={difficulty} value={currentGuess} onChangeText={setCurrentGuess}
                  onSubmitEditing={handleGuess} inputAccessoryViewID="GuessAccessory"
                  returnKeyType="done" autoFocus
                />
                <TouchableOpacity style={styles.guessBtn} onPress={handleGuess}><Text style={styles.btnText}>Go</Text></TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.quitBtn} onPress={() => { clearInterval(gameTimer); setScreen('menu'); }}><Text style={{color: THEME.danger}}>Quit Game</Text></TouchableOpacity>
            </>
          ) : (
            <View style={styles.wonContainer}>
                <Text style={styles.celebrationText}>HOORAY!</Text>
                <Text style={styles.wonTitle}>YOU WON!</Text>
                <Text style={styles.wonNumber}>{targetNumber}</Text>
                
                <View style={styles.wonStatsRow}>
                  <Text style={styles.wonStatItem}>{guessesCount} Guesses</Text>
                  <Text style={styles.wonStatItem}>•</Text>
                  <Text style={styles.wonStatItem}>{timeTaken} Seconds</Text>
                </View>

                <View style={styles.gameOverRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={startGame}><Text style={styles.btnText}>Play Again</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#444'}]} onPress={() => setScreen('menu')}><Text style={styles.btnText}>Home</Text></TouchableOpacity>
                </View>
            </View>
          )}

          <View style={styles.historySectionGame}>
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
            {isGameWon && (
              <TouchableOpacity style={styles.leaderboardLink} onPress={() => { setLeaderboardType('time'); fetchLeaderboard('time'); }}>
                <Text style={styles.linkText}>View Global Leaderboard</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      {screen === 'leaderboard' && (
        <View style={styles.listContainer}>
          <Text style={styles.subTitle}>Global Top 20 ({difficulty} Digits)</Text>
          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tab, leaderboardType === 'time' && styles.activeTab]} onPress={() => { setLeaderboardType('time'); fetchLeaderboard('time'); }}>
              <Text style={styles.tabText}>Fastest</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, leaderboardType === 'guesses' && styles.activeTab]} onPress={() => { setLeaderboardType('guesses'); fetchLeaderboard('guesses'); }}>
              <Text style={styles.tabText}>Fewest Tries</Text>
            </TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator color={THEME.primary} size="large" /> : (
            <FlatList
              data={leaders} keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <View style={styles.scoreRow}>
                  <Text style={styles.rank}>#{index + 1}</Text>
                  <Text style={styles.name}>{item.profiles ? item.profiles.username : 'Anon'}</Text>
                  <Text style={styles.scoreVal}>{leaderboardType === 'time' ? `${item.time_seconds}s` : `${item.guesses_count}`}</Text>
                </View>
              )}
            />
          )}
          <TouchableOpacity style={styles.backButton} onPress={() => setScreen('menu')}><Text style={styles.btnTextSmall}>Back to Menu</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg, paddingTop: 60 },
  mainContainer: { flex: 1, paddingHorizontal: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 32, fontWeight: '900', color: THEME.text, letterSpacing: 1 },
  welcomeSection: { marginBottom: 30, alignItems: 'center' },
  welcomeText: { fontSize: 20, color: THEME.textDim },
  usernameHighlight: { color: THEME.text, fontWeight: 'bold' },
  editLink: { color: THEME.primary, fontSize: 14, marginTop: 5 },
  nameInputRow: { flexDirection: 'row', width: '100%', gap: 10 },
  input: { flex: 1, backgroundColor: THEME.inputBg, color: THEME.text, padding: 15, borderRadius: 12, fontSize: 16 },
  saveBtn: { backgroundColor: THEME.primary, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 12 },
  menuSection: { alignItems: 'center', marginBottom: 20 },
  label: { fontSize: 14, color: THEME.textDim, marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1 },
  diffRow: { flexDirection: 'row', gap: 20, marginBottom: 30 },
  diffButton: { width: 60, height: 60, borderRadius: 30, backgroundColor: THEME.inputBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: THEME.inputBg },
  activeDiff: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  diffText: { fontSize: 20, fontWeight:'bold', color: THEME.textDim },
  activeText: { color: '#FFF' },
  startButton: { backgroundColor: THEME.success, paddingVertical: 18, width: '100%', alignItems:'center', borderRadius: 16 },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  btnTextSmall: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  linkText: { color: THEME.primary, fontSize: 16, fontWeight: '600' },
  historySection: { flex: 1, borderTopWidth: 1, borderColor: '#333', paddingTop: 20 },
  subTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: THEME.text },
  historyCard: { flexDirection: 'row', alignItems: 'center', justifyContent:'space-between', backgroundColor: THEME.card, padding: 15, borderRadius: 12, marginBottom: 10 },
  historyBadge: { backgroundColor: '#333', width: 30, height: 30, borderRadius: 15, alignItems:'center', justifyContent:'center'},
  historyBadgeText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  historyCardText: { fontSize: 16, color: THEME.text, fontWeight:'600' },
  gameContainer: { flex: 1, padding: 20, alignItems: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  statText: { fontSize: 18, fontWeight: 'bold', color: THEME.textDim },
  feedbackLarge: { fontSize: 22, fontWeight: 'bold', color: THEME.primary, marginBottom: 30, textAlign: 'center' },
  inputSection: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  gameInput: { backgroundColor: THEME.inputBg, color: THEME.text, fontSize: 28, width: 150, textAlign: 'center', padding: 15, borderRadius: 16, letterSpacing: 4, fontWeight: 'bold' },
  guessBtn: { backgroundColor: THEME.primary, justifyContent: 'center', paddingHorizontal: 25, borderRadius: 16 },
  accessoryBar: { backgroundColor: THEME.primary, padding: 12, alignItems: 'center', justifyContent: 'center' },
  accessoryButton: { width: '100%', alignItems: 'center' },
  accessoryText: { color: '#FFF', fontWeight: 'bold', fontSize: 18, letterSpacing: 1 },
  wonContainer: { alignItems: 'center', marginBottom: 20, width: '100%' },
  celebrationText: { fontSize: 20, color: THEME.textDim, marginBottom: 5, letterSpacing: 2 },
  wonTitle: { fontSize: 36, fontWeight: '900', color: THEME.success, marginBottom: 15 },
  wonNumber: { fontSize: 48, fontWeight: 'bold', color: THEME.gold, marginBottom: 20, letterSpacing: 5 },
  wonStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  wonStatItem: { fontSize: 18, color: THEME.text, fontWeight: '600' },
  gameOverRow: { flexDirection: 'row', gap: 15, marginBottom: 10 },
  actionBtn: { backgroundColor: THEME.success, paddingVertical: 15, paddingHorizontal: 25, borderRadius: 12, minWidth: 130, alignItems:'center' },
  historySectionGame: { flex: 1, width: '100%', marginTop: 10 },
  historyList: { width: '100%' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: THEME.card, padding: 16, borderRadius: 12, marginBottom: 10 },
  histGuess: { fontSize: 20, fontWeight: 'bold', color: THEME.text, letterSpacing: 2 },
  histResult: { fontSize: 16, color: THEME.textDim },
  quitBtn: { marginTop: 10, padding: 15 },
  leaderboardLink: { padding: 15, alignItems: 'center' },
  listContainer: { flex: 1, padding: 20 },
  tabRow: { flexDirection: 'row', marginBottom: 20 },
  tab: { flex: 1, padding: 12, alignItems: 'center', borderBottomWidth: 2, borderColor: '#333' },
  activeTab: { borderColor: THEME.primary },
  tabText: { color: THEME.text, fontWeight: '600' },
  scoreRow: { flexDirection: 'row', backgroundColor: THEME.card, padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  rank: { fontWeight: 'bold', width: 35, color: '#666', fontSize: 16 },
  name: { flex: 1, fontSize: 16, color: THEME.text },
  scoreVal: { fontWeight: 'bold', color: THEME.primary, fontSize: 16 },
  backButton: { backgroundColor: '#333', padding: 15, alignItems: 'center', borderRadius: 12, marginTop: 10 }
});