import 'react-native-gesture-handler';
import React, { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, 
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, 
  StatusBar, Keyboard, ScrollView, Linking as RNLinking 
} from 'react-native';
import { NavigationContainer, useNavigation, useFocusEffect } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context'; 
import { supabase } from './supabase'; 
import ConfettiCannon from 'react-native-confetti-cannon'; 
import * as Haptics from 'expo-haptics'; 
import { Ionicons } from '@expo/vector-icons'; 

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';

WebBrowser.maybeCompleteAuthSession();

const THEME = {
  bg: '#121212', card: '#1E1E1E', text: '#FFFFFF', textDim: '#AAAAAA', 
  primary: '#0A84FF', success: '#30D158', danger: '#FF453A', inputBg: '#2C2C2E',
  gold: '#FFD700', drawerBg: '#1A1A1A', google: '#4285F4' 
};

const UserContext = createContext();
const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

// ==========================================
// 1. GATEWAY: WELCOME SCREEN (THE PRO UX UPGRADE)
// ==========================================
function WelcomeScreen() {
  const { session, setUsername } = useContext(UserContext);
  const [nameInput, setNameInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState('initial'); // 👈 Tracks which screen to show

  const checkIsNameTaken = async (name) => {
    const { data } = await supabase.from('profiles').select('username').eq('username', name).single();
    return !!data;
  };

  // 🔘 BUTTON 1: GOOGLE LOGIN
  const handleGoogleLogin = async () => {
    setIsSaving(true);

    try {
      const redirectUrl = Linking.createURL('');
      const { data, error } = await supabase.auth.signInWithOAuth({ 
        provider: 'google', 
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true } 
      });
      if (error) throw error;
      
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      
      if (res.type === 'success' && res.url) {
        const urlParams = res.url.split('#')[1]; 
        if (urlParams) {
           let access_token = null, refresh_token = null;
           urlParams.split('&').forEach(param => {
              const splitIndex = param.indexOf('=');
              if (splitIndex > 0) {
                const key = param.substring(0, splitIndex);
                const value = param.substring(splitIndex + 1);
                if (key === 'access_token') access_token = value;
                if (key === 'refresh_token') refresh_token = value;
              }
           });

           if (access_token && refresh_token) {
              const { data: sessionData, error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
              if (sessionError) throw sessionError;
              
              // Check if they are a returning user
              const { data: profile } = await supabase.from('profiles').select('username').eq('id', sessionData.session.user.id).single();

              if (profile && profile.username) {
                 // 🎉 RETURNING USER: Let them straight in!
                 setUsername(profile.username);
              } else {
                 // 🆕 NEW USER: Flip the screen to ask for a username
                 setStep('name');
              }
           }
        }
      }
    } catch (err) {
      Alert.alert("Login Error", err.message);
    } finally {
      setIsSaving(false); 
    }
  };

  // 🔘 BUTTON 2: PLAY AS GUEST
  const handleGuestPlay = () => {
    // Just flip the screen to ask for a username!
    setStep('name');
  };

  // 🔘 THE SUBMIT BUTTON (For both Google and Guest new users)
  const handleSubmitName = async () => {
    if (!nameInput.trim()) return Alert.alert("Required", "Please choose a username!");
    if (!session) return Alert.alert("Wait", "Initializing connection...");

    setIsSaving(true);
    const isTaken = await checkIsNameTaken(nameInput.trim());
    
    if (isTaken) {
      setIsSaving(false);
      return Alert.alert("Taken", "That username is already in use. Try another!");
    }

    // Save the name to whoever is currently logged in (Google or Anonymous Guest)
    const { error } = await supabase.from('profiles').upsert({ id: session.user.id, username: nameInput.trim() });
    
    if (error) Alert.alert("Error", error.message);
    else setUsername(nameInput.trim()); // Unlocks the main app!
    
    setIsSaving(false);
  };

  return (
    <SafeAreaView style={styles.screenContainer}>
      
      {/* ⬆️ PINNED TO THE TOP ⬆️ */}
      <View style={{ width: '100%', alignItems: 'center', marginTop: Platform.OS === 'android' ? 40 : 20 }}>
        <Text style={{ fontSize: 42, fontWeight: '900', color: THEME.text, letterSpacing: 2 }}>
          PlaceNDigits
        </Text>
      </View>

      {/* 🎯 CENTERED IN THE MIDDLE 🎯 */}
      <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
        <Text style={{ color: THEME.textDim, marginBottom: 40, fontSize: 16 }}>
           {step === 'initial' ? "Sign in or play as a guest." : "Pick a unique identity to start playing."}
        </Text>

        {step === 'initial' ? (
          // 📺 SCREEN 1: THE CHOICES
          <View style={{ width: '100%', marginBottom: 30 }}>
            
            {/* 👇 THE NEW APPLE BUTTON 👇 */}
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={16}
                style={{ width: '100%', height: 55, marginBottom: 15 }}
                onPress={async () => {
                  try {
                    setIsSaving(true);
                    const credential = await AppleAuthentication.signInAsync({
                      requestedScopes: [
                        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                        AppleAuthentication.AppleAuthenticationScope.EMAIL,
                      ],
                    });
                    
                    // 1. Hand the Apple token to Supabase
                    if (credential.identityToken) {
                      const { data, error } = await supabase.auth.signInWithIdToken({
                        provider: 'apple',
                        token: credential.identityToken,
                      });

                      if (error) throw error;

                      // 2. Check if they are a returning user
                      const { data: profile } = await supabase.from('profiles').select('username').eq('id', data.session.user.id).single();

                      if (profile && profile.username) {
                         // 🎉 RETURNING USER: Let them straight in!
                         setUsername(profile.username);
                      } else {
                         // 🆕 NEW USER: Flip the screen to ask for a username
                         setStep('name');
                      }
                    } else {
                      throw new Error("No identity token provided by Apple.");
                    }
                  } catch (e) {
                    if (e.code !== 'ERR_REQUEST_CANCELED') {
                      Alert.alert("Apple Login Error", e.message);
                    }
                  } finally {
                    setIsSaving(false);
                  }
                }}
              />
            )}

            <TouchableOpacity style={[styles.startButton, { backgroundColor: THEME.google, marginBottom: 15 }]} onPress={handleGoogleLogin}>
              {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>🌐 Sign in with Google</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.helpButtonLarge, { backgroundColor: THEME.card }]} onPress={handleGuestPlay}>
              <Text style={[styles.btnText, { color: THEME.textDim }]}>Play as Guest</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // 📺 SCREEN 2: THE USERNAME INPUT
          <View style={{ width: '100%', marginBottom: 30 }}>
            <TextInput 
              style={[styles.input, { width: '100%', marginBottom: 20, textAlign: 'center', fontSize: 20 }]} 
              placeholder="Choose a username" 
              placeholderTextColor="#777" 
              value={nameInput} 
              onChangeText={setNameInput} 
              autoFocus
            />

            <TouchableOpacity style={[styles.startButton, { backgroundColor: THEME.success, marginBottom: 15 }]} onPress={handleSubmitName}>
              {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Continue</Text>}
            </TouchableOpacity>

            {/* Back button */}
            <TouchableOpacity onPress={() => setStep('initial')} style={{alignItems: 'center', padding: 10}}>
                <Text style={{color: THEME.textDim, fontSize: 16}}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ==========================================
// 2. CUSTOM DRAWER CONTENT
// ==========================================
function CustomDrawerContent(props) {
  const { username, setUsername } = useContext(UserContext); 

  const handleLogOut = async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: async () => {
          await supabase.auth.signOut(); 
          setUsername(''); 
          await supabase.auth.signInAnonymously(); 
          props.navigation.closeDrawer(); 
      }}
    ]);
  };

  return (
    <View style={{flex: 1, backgroundColor: THEME.drawerBg}}>
      <SafeAreaView edges={['top']} style={{backgroundColor: '#252525'}}>
        <View style={{padding: 20, alignItems: 'center', flexDirection:'row', gap: 15}}>
          <View style={{width: 50, height: 50, borderRadius: 25, backgroundColor: THEME.primary, alignItems: 'center', justifyContent: 'center'}}>
            <Text style={{fontSize: 20, fontWeight: 'bold', color: '#FFF'}}>{username ? username.charAt(0).toUpperCase() : '?'}</Text>
          </View>
          <View>
             <Text style={{color: '#FFF', fontSize: 16, fontWeight: 'bold'}}>{username || 'Guest'}</Text>
          </View>
        </View>
      </SafeAreaView>
      <DrawerContentScrollView {...props} contentContainerStyle={{paddingTop: 0}}>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>
      
      <View style={{padding: 20, borderTopWidth: 1, borderTopColor: '#333'}}>
        <TouchableOpacity onPress={handleLogOut} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, marginBottom: 15}}>
          <Ionicons name="log-out-outline" size={24} color={THEME.danger} />
          <Text style={{color: THEME.danger, fontSize: 16, fontWeight: 'bold'}}>Log Out</Text>
        </TouchableOpacity>
        <Text style={{color: '#555', fontSize: 12}}>Version 1.2</Text>
      </View>
    </View>
  );
}

// ==========================================
// 3. MAIN GAME SCREEN (CLEANED UP)
// ==========================================
function GameScreen() {
  const { session, username } = useContext(UserContext);
  const navigation = useNavigation();
  
  const [difficulty, setDifficulty] = useState(4);
  const [targetNumber, setTargetNumber] = useState('');
  const [currentGuess, setCurrentGuess] = useState('');
  const [feedback, setFeedback] = useState('Good Luck!');
  const [guessesCount, setGuessesCount] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);
  const [gameTimer, setGameTimer] = useState(null);
  const [history, setHistory] = useState([]); 
  const [isGameWon, setIsGameWon] = useState(false);
  const [gameState, setGameState] = useState('idle'); 

  const generateUniqueNumber = (length) => {
    let digits = [];
    while (digits.length < length) {
      const r = Math.floor(Math.random() * 10);
      if (!digits.includes(r)) digits.push(r);
    }
    return digits.join('');
  };

  const startGame = async () => {
    const newTarget = generateUniqueNumber(difficulty);
    setTargetNumber(newTarget);
    setGuessesCount(0);
    setTimeTaken(0);
    setFeedback('Good Luck!');
    setCurrentGuess('');
    setHistory([]);
    setIsGameWon(false);
    setGameState('playing');
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
    let places = 0; let digits = 0;
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
      setGameState('won');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if(session) await supabase.from('leaderboards').insert([{ user_id: session.user.id, difficulty, time_seconds: timeTaken, guesses_count: newCount }]);
      Keyboard.dismiss(); 
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.headerSideBtn}>
          <Ionicons name="menu" size={32} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PlaceNDigits</Text>
        <View style={styles.headerSideBtn} /> 
      </View>

      {isGameWon && <ConfettiCannon count={200} origin={{x: -10, y: 0}} fadeOut={true} />}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1, paddingHorizontal: 20}}>
        
        {gameState === 'idle' && (
          <View style={styles.centerContent}>
            <View style={{marginBottom: 30, width: '100%', alignItems: 'center'}}>
                <Text style={{fontSize: 20, color: THEME.textDim}}>
                  Welcome, <Text style={{color: THEME.text, fontWeight: 'bold'}}>{username}</Text>
                </Text>
            </View>

            <Text style={styles.label}>Select Difficulty</Text>
            <View style={styles.diffRow}>
              {[3, 4, 5].map(num => (
                <TouchableOpacity key={num} style={[styles.diffButton, difficulty === num && styles.activeDiff]} onPress={() => setDifficulty(num)}>
                  <Text style={[styles.diffText, difficulty === num && styles.activeText]}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity style={styles.startButton} onPress={startGame}>
              <Text style={styles.btnText}>Start Game</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.helpButtonLarge} onPress={() => navigation.navigate('How to Play')}>
               <Text style={styles.btnText}>❓ How to Play</Text>
            </TouchableOpacity>
          </View>
        )}

        {gameState === 'playing' && (
          <View style={{flex: 1, alignItems: 'center', paddingTop: 20}}>
             <View style={styles.statsRow}>
                <Text style={styles.statText}>⏳ {timeTaken}s</Text>
                <Text style={styles.statText}>#️⃣ {guessesCount}</Text>
              </View>
              <Text style={styles.feedbackLarge}>{feedback}</Text>
              <View style={styles.inputSection}>
                <TextInput style={styles.gameInput} placeholder="?" placeholderTextColor="#555" keyboardType="numeric" maxLength={difficulty} value={currentGuess} onChangeText={setCurrentGuess} onSubmitEditing={handleGuess} returnKeyType="done" autoFocus />
                <TouchableOpacity style={styles.guessBtn} onPress={handleGuess}><Text style={styles.btnText}>Go</Text></TouchableOpacity>
              </View>
              <View style={styles.historySectionGame}>
                 <FlatList data={history} keyExtractor={item => item.id.toString()} style={styles.historyList} renderItem={({ item }) => (
                    <View style={styles.historyRow}>
                      <Text style={styles.histGuess}>{item.guess}</Text>
                      <Text style={styles.histResult}>{item.result}</Text>
                    </View>
                  )} />
              </View>
              <TouchableOpacity style={styles.quitBtn} onPress={() => { clearInterval(gameTimer); setGameState('idle'); }}><Text style={{color: THEME.danger}}>Quit Game</Text></TouchableOpacity>
          </View>
        )}

        {gameState === 'won' && (
           <View style={{alignItems: 'center', marginTop: 40}}>
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
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#444'}]} onPress={() => setGameState('idle')}><Text style={styles.btnText}>Home</Text></TouchableOpacity>
              </View>
           </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ==========================================
// 4. OTHER SCREENS (Profile, Leaderboard, etc)
// ==========================================
function ProfileScreen() {
  const { session, username, setUsername } = useContext(UserContext);
  const [inputText, setInputText] = useState(username || '');
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false); 
  const navigation = useNavigation();

  // Checks if the user is a Guest by looking at their login provider
  const isGuest = session?.user?.app_metadata?.provider !== 'google';

  useEffect(() => { setInputText(username || ''); }, [username]);

  const handleSave = async () => {
    if (!session || !inputText.trim()) return;
    if (inputText.trim() === username) return setIsEditing(false);

    setLoading(true);
    const { error } = await supabase.from('profiles').upsert({ id: session.user.id, username: inputText.trim() });
    setLoading(false);
    
    if (error) {
       if (error.code === '23505') Alert.alert("Taken", "Username already exists. Try another!");
       else Alert.alert("Error", error.message);
    } else {
       setUsername(inputText.trim());
       setIsEditing(false); 
       Alert.alert("Success", "Username updated!");
    }
  };
  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // 1. Call the Supabase RPC function we just created
            const { error } = await supabase.rpc('delete_user');
            
            if (error) {
              Alert.alert("Error deleting account", error.message);
            } else {
              // 2. Log them out to clear the app's local memory and return to the Welcome screen
              await supabase.auth.signOut();
              setUsername('');
            }
          }
        }
      ]
    );
  };

  // 👇 NEW: Allows a guest to link their Google Account from the profile screen!
  const handleLinkGoogle = async () => {
    setLoading(true);
    try {
      const redirectUrl = Linking.createURL('');
      const { data, error } = await supabase.auth.signInWithOAuth({ 
        provider: 'google', 
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true } 
      });
      if (error) throw error;
      
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      
      if (res.type === 'success' && res.url) {
        const urlParams = res.url.split('#')[1]; 
        if (urlParams) {
           let access_token = null, refresh_token = null;
           urlParams.split('&').forEach(param => {
              const splitIndex = param.indexOf('=');
              if (splitIndex > 0) {
                const key = param.substring(0, splitIndex);
                const value = param.substring(splitIndex + 1);
                if (key === 'access_token') access_token = value;
                if (key === 'refresh_token') refresh_token = value;
              }
           });

           if (access_token && refresh_token) {
              const { data: sessionData, error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
              if (sessionError) throw sessionError;
              
              // Ensure their unique username is preserved
              await supabase.from('profiles').upsert({ id: sessionData.session.user.id, username });
              Alert.alert("Success!", "Your Google account has been permanently linked.");
           }
        }
      }
    } catch (err) {
      Alert.alert("Link Error", err.message);
    } finally {
      setLoading(false); 
    }
  };

  return (
    <SafeAreaView style={styles.screenContainer}>
       <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.backLink}>
           <Text style={styles.linkText}>☰ Menu</Text>
       </TouchableOpacity>
       <Text style={styles.title}>Profile</Text>
       
       <Text style={styles.label}>Username</Text>
       
       {isEditing ? (
           <View style={{width: '100%'}}>
               <TextInput style={[styles.input, {width: '100%', marginBottom: 15}]} value={inputText} onChangeText={setInputText} placeholder="Choose a unique username" placeholderTextColor="#666" autoFocus />
               <TouchableOpacity style={styles.startButton} onPress={handleSave}>
                   {loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.btnText}>Save Profile</Text>}
               </TouchableOpacity>
               <TouchableOpacity style={[styles.startButton, {backgroundColor: '#444', marginTop: -5}]} onPress={() => {setInputText(username || ''); setIsEditing(false);}}>
                   <Text style={styles.btnText}>Cancel</Text>
               </TouchableOpacity>
           </View>
       ) : (
           <View style={{width: '100%', alignItems: 'flex-start'}}>
               <Text style={{fontSize: 24, color: THEME.text, fontWeight: 'bold', marginBottom: 20}}>{username || 'Guest'}</Text>
               <TouchableOpacity style={[styles.startButton, {backgroundColor: THEME.primary}]} onPress={() => setIsEditing(true)}>
                   <Text style={styles.btnText}>✏️ Edit Username</Text>
               </TouchableOpacity>

               {isGuest && (
                 <TouchableOpacity style={[styles.startButton, {backgroundColor: THEME.google, marginTop: 20}]} onPress={handleLinkGoogle}>
                     {loading ? <ActivityIndicator color="#FFF"/> : <Text style={styles.btnText}>🌐 Link Google Account</Text>}
                 </TouchableOpacity>
               )}

               {/* 👇 THE NEW DELETE BUTTON 👇 */}
               <TouchableOpacity 
                 style={[styles.startButton, {backgroundColor: 'transparent', borderWidth: 1, borderColor: THEME.danger, marginTop: 40}]} 
                 onPress={handleDeleteAccount}
               >
                   <Text style={[styles.btnText, {color: THEME.danger}]}>🗑️ Delete Account</Text>
               </TouchableOpacity>
           </View>
       )}
    </SafeAreaView>
  );
}

function LeaderboardScreen() {
  const navigation = useNavigation();
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true); 
  const [difficulty, setDifficulty] = useState(4);
  const [sortBy, setSortBy] = useState('time'); 

  useFocusEffect(useCallback(() => { fetchLeaders(); }, [difficulty, sortBy]));

  const fetchLeaders = async () => {
    setLoading(true);
    let query = supabase.from('leaderboards').select(`difficulty, time_seconds, guesses_count, profiles!user_id (username)`).eq('difficulty', difficulty);
    if (sortBy === 'time') query = query.order('time_seconds', { ascending: true });
    else query = query.order('guesses_count', { ascending: true });
    
    const { data } = await query.limit(20);
    if(data) setLeaders(data);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.screenContainer}>
       <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.backLink}><Text style={styles.linkText}>☰ Menu</Text></TouchableOpacity>
       <Text style={styles.title}>Global Top 20</Text>
       <View style={styles.diffRow}>
          {[3, 4, 5].map(num => (
            <TouchableOpacity key={num} style={[styles.diffButton, difficulty === num && styles.activeDiff]} onPress={() => setDifficulty(num)}><Text style={[styles.diffText, difficulty === num && styles.activeText]}>{num}</Text></TouchableOpacity>
          ))}
       </View>
       <View style={styles.tabRow}>
         <TouchableOpacity style={[styles.tab, sortBy === 'time' && styles.activeTab]} onPress={() => setSortBy('time')}><Text style={styles.tabText}>Fastest Time ⚡️</Text></TouchableOpacity>
         <TouchableOpacity style={[styles.tab, sortBy === 'guesses' && styles.activeTab]} onPress={() => setSortBy('guesses')}><Text style={styles.tabText}>Fewest Tries 🎯</Text></TouchableOpacity>
       </View>
       {loading ? <ActivityIndicator color={THEME.primary} size="large" style={{marginTop: 50}} /> : (
           <FlatList data={leaders} keyExtractor={(item, i) => i.toString()} renderItem={({ item, index }) => (
                 <View style={styles.scoreRow}>
                    <Text style={styles.rank}>#{index + 1}</Text>
                    <Text style={styles.name}>{item.profiles ? item.profiles.username : 'Anon'}</Text>
                    <Text style={styles.scoreVal}>{sortBy === 'time' ? `${item.time_seconds}s` : `${item.guesses_count} tries`}</Text>
                 </View>
              )} ListEmptyComponent={<Text style={{color:'#666', textAlign:'center', marginTop:20}}>No scores yet. Be the first!</Text>} />
       )}
    </SafeAreaView>
  );
}

function HistoryScreen() {
  const { session } = useContext(UserContext);
  const navigation = useNavigation();
  const [history, setMyHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { if (session) fetchMyHistory(); }, [session]));

  const fetchMyHistory = async () => {
    setLoading(true); 
    const { data } = await supabase.from('leaderboards').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50);
    if (data) setMyHistory(data);
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.screenContainer}>
       <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.backLink}><Text style={styles.linkText}>☰ Menu</Text></TouchableOpacity>
       <Text style={styles.title}>My Game History</Text>
       {!loading && history.length > 0 && (
         <View style={styles.historyHeaderRow}>
            <Text style={[styles.historyHeaderText, {width: 30}]}>#</Text>
            <Text style={[styles.historyHeaderText, {flex: 1, textAlign: 'center'}]}>Difficulty</Text>
            <Text style={[styles.historyHeaderText, {flex: 1, textAlign: 'center'}]}>Seconds</Text>
            <Text style={[styles.historyHeaderText, {flex: 1, textAlign: 'center'}]}>Tries</Text>
         </View>
       )}
       {loading ? <ActivityIndicator color={THEME.primary} size="large" style={{marginTop: 50}} /> : (
           <FlatList data={history} keyExtractor={item => item.id.toString()} renderItem={({item, index}) => (
                <View style={styles.historyCardGrid}>
                   <Text style={styles.historyIndex}>{index + 1}</Text>
                   <View style={{flex: 1, alignItems: 'center'}}><View style={styles.historyBadge}><Text style={styles.historyBadgeText}>{item.difficulty}</Text></View></View>
                   <Text style={[styles.historyCardText, {flex: 1, textAlign: 'center'}]}>⏳ {item.time_seconds}s</Text>
                   <Text style={[styles.historyCardText, {flex: 1, textAlign: 'center'}]}>#️⃣ {item.guesses_count}</Text>
                </View>
              )} ListEmptyComponent={<Text style={{color:'#666', textAlign:'center', marginTop:20}}>No games played yet.</Text>} />
       )}
    </SafeAreaView>
  );
}

function RulesScreen() {
  const navigation = useNavigation();
  return (
    <SafeAreaView style={styles.screenContainer}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.backLink}><Text style={styles.linkText}>☰ Menu</Text></TouchableOpacity>
        <Text style={styles.title}>How to Play 🧩</Text>
        <ScrollView>
          <Text style={styles.modalText}>The goal is to guess the hidden secret number.</Text>
          <Text style={styles.ruleHeader}>1. The Rules</Text>
          <Text style={styles.modalText}>• All digits are <Text style={{fontWeight:'bold'}}>UNIQUE</Text>.</Text>
          <Text style={styles.modalText}>• Digits are between 0-9.</Text>
          <Text style={styles.ruleHeader}>2. The Feedback</Text>
          <View style={styles.exampleBox}>
            <Text style={styles.exampleText}>🟢 <Text style={{color: THEME.success}}>PLACE:</Text> Right number, Right spot.</Text>
            <Text style={styles.exampleText}>🟡 <Text style={{color: THEME.gold}}>DIGIT:</Text> Right number, Wrong spot.</Text>
          </View>
        </ScrollView>
    </SafeAreaView>
  );
}

function PrivacyScreen() {
  const navigation = useNavigation();
  const openLink = () => { RNLinking.openURL('https://alder-ulna-f96.notion.site/Privacy-Policy-2b738e90ac18808b93a4e98828be9790'); };
  return (
    <SafeAreaView style={styles.screenContainer}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.backLink}><Text style={styles.linkText}>☰ Menu</Text></TouchableOpacity>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.modalText}>We value your privacy. We do not collect personal data other than the username you provide for the leaderboard.</Text>
        <TouchableOpacity style={styles.startButton} onPress={openLink}><Text style={styles.btnText}>Read Full Policy</Text></TouchableOpacity>
    </SafeAreaView>
  );
}


// ==========================================
// 5. MAIN ARCHITECTURE
// ==========================================

// Holds all the Drawer screens
function MainDrawerApp() {
  return (
    <Drawer.Navigator initialRouteName="Home" drawerContent={(props) => <CustomDrawerContent {...props} />} screenOptions={{ headerShown: false, drawerStyle: { backgroundColor: THEME.drawerBg, width: 280 }, drawerActiveTintColor: THEME.primary, drawerInactiveTintColor: THEME.text, sceneContainerStyle: { backgroundColor: THEME.bg } }}>
      <Drawer.Screen name="Home" component={GameScreen} options={{ drawerIcon: ({color}) => <Ionicons name="game-controller-outline" size={22} color={color} /> }}/>
      <Drawer.Screen name="Profile" component={ProfileScreen} options={{ drawerIcon: ({color}) => <Ionicons name="person-outline" size={22} color={color} /> }}/>
      <Drawer.Screen name="Leaderboard" component={LeaderboardScreen} options={{ drawerIcon: ({color}) => <Ionicons name="trophy-outline" size={22} color={color} /> }}/>
      <Drawer.Screen name="History" component={HistoryScreen} options={{ drawerIcon: ({color}) => <Ionicons name="time-outline" size={22} color={color} /> }}/>
      <Drawer.Screen name="How to Play" component={RulesScreen} options={{ drawerIcon: ({color}) => <Ionicons name="help-circle-outline" size={22} color={color} /> }}/>
      <Drawer.Screen name="Privacy" component={PrivacyScreen} options={{ drawerIcon: ({color}) => <Ionicons name="lock-closed-outline" size={22} color={color} /> }}/>
    </Drawer.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [username, setUsername] = useState('');
  const [isAppReady, setIsAppReady] = useState(false); // 👇 Prevents flashing

  useEffect(() => {
    // Check initial session
    const initApp = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session) {
        await fetchProfile(session.user.id);
      } else {
        await supabase.auth.signInAnonymously();
      }
      setIsAppReady(true); // App is finished loading data behind the scenes
    };
    
    initApp();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('username').eq('id', userId).single();
    if (data) setUsername(data.username);
  };

  // Show a blank dark screen while Supabase wakes up
  if (!isAppReady) {
    return <View style={{ flex: 1, backgroundColor: THEME.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <UserContext.Provider value={{ session, username, setUsername, fetchProfile }}>
        <NavigationContainer>
          <StatusBar barStyle="light-content" />
          
          {/* 👇 STACK NAVIGATOR LOGIC 👇 */}
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!username ? (
              // If they don't have a username, lock them out with the Welcome screen
              <Stack.Screen name="Welcome" component={WelcomeScreen} />
            ) : (
              // If they have a username, let them into the game!
              <Stack.Screen name="Main" component={MainDrawerApp} />
            )}
          </Stack.Navigator>

        </NavigationContainer>
      </UserContext.Provider>
    </SafeAreaProvider>
  );
}

// ==========================================
// 6. STYLES
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  screenContainer: { flex: 1, backgroundColor: THEME.bg, padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, marginTop: Platform.OS === 'android' ? 40 : 0 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: THEME.text, letterSpacing: 1, flex: 1, textAlign: 'center' },
  headerSideBtn: { width: 60, height: 40, justifyContent: 'center' },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 60, width: '100%' },
  diffRow: { flexDirection: 'row', gap: 20, marginBottom: 30, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: THEME.text, marginBottom: 20 },
  backLink: { marginBottom: 20 },
  linkText: { color: THEME.primary, fontSize: 16 },
  label: { fontSize: 14, color: THEME.textDim, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  diffButton: { width: 60, height: 60, borderRadius: 30, backgroundColor: THEME.inputBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: THEME.inputBg },
  activeDiff: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  diffText: { fontSize: 20, fontWeight:'bold', color: THEME.textDim },
  activeText: { color: '#FFF' },
  startButton: { backgroundColor: THEME.success, paddingVertical: 18, width: '100%', alignItems:'center', borderRadius: 16, marginBottom: 15 },
  helpButtonLarge: { backgroundColor: '#333', paddingVertical: 15, width: '100%', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#444' },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  input: { backgroundColor: THEME.inputBg, color: THEME.text, padding: 15, borderRadius: 12, fontSize: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  statText: { fontSize: 18, fontWeight: 'bold', color: THEME.textDim },
  feedbackLarge: { fontSize: 22, fontWeight: 'bold', color: THEME.primary, marginBottom: 30, textAlign: 'center' },
  inputSection: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  gameInput: { backgroundColor: THEME.inputBg, color: THEME.text, fontSize: 28, width: 150, textAlign: 'center', padding: 15, borderRadius: 16, letterSpacing: 4, fontWeight: 'bold' },
  guessBtn: { backgroundColor: THEME.primary, justifyContent: 'center', paddingHorizontal: 25, borderRadius: 16 },
  quitBtn: { marginTop: 10, padding: 15 },
  historySectionGame: { flex: 1, width: '100%', marginTop: 10 },
  historyList: { width: '100%' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: THEME.card, padding: 16, borderRadius: 12, marginBottom: 10 },
  histGuess: { fontSize: 20, fontWeight: 'bold', color: THEME.text, letterSpacing: 2 },
  histResult: { fontSize: 16, color: THEME.textDim },
  wonContainer: { alignItems: 'center', marginBottom: 20, width: '100%' },
  celebrationText: { fontSize: 20, color: THEME.textDim, marginBottom: 5, letterSpacing: 2 },
  wonTitle: { fontSize: 36, fontWeight: '900', color: THEME.success, marginBottom: 15 },
  wonNumber: { fontSize: 48, fontWeight: 'bold', color: THEME.gold, marginBottom: 20, letterSpacing: 5 },
  wonStatsRow: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  wonStatItem: { fontSize: 18, color: THEME.text, fontWeight: '600' },
  gameOverRow: { flexDirection: 'row', gap: 15, marginBottom: 10 },
  actionBtn: { backgroundColor: THEME.success, paddingVertical: 15, paddingHorizontal: 25, borderRadius: 12, minWidth: 130, alignItems:'center' },
  scoreRow: { flexDirection: 'row', backgroundColor: THEME.card, padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  rank: { fontWeight: 'bold', width: 35, color: '#666', fontSize: 16 },
  name: { flex: 1, fontSize: 16, color: THEME.text },
  scoreVal: { fontWeight: 'bold', color: THEME.primary, fontSize: 16 },
  tabRow: { flexDirection: 'row', marginBottom: 15, backgroundColor: '#333', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: THEME.primary },
  tabText: { fontWeight: 'bold', color: '#FFF' },
  historyCard: { flexDirection: 'row', alignItems: 'center', justifyContent:'space-between', backgroundColor: THEME.card, padding: 15, borderRadius: 12, marginBottom: 10 },
  historyBadge: { backgroundColor: '#333', width: 30, height: 30, borderRadius: 15, alignItems:'center', justifyContent:'center'},
  historyBadgeText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  historyCardText: { fontSize: 16, color: THEME.text, fontWeight:'600' },
  modalText: { color: '#DDD', fontSize: 16, marginBottom: 10, lineHeight: 24 },
  ruleHeader: { color: THEME.primary, fontSize: 18, fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
  exampleBox: { backgroundColor: '#111', padding: 10, borderRadius: 10, marginVertical: 10 },
  exampleText: { color: '#FFF', fontSize: 15, marginBottom: 5 },
  historyHeaderRow: { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#333', marginBottom: 10 },
  historyHeaderText: { color: '#888', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  historyCardGrid: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.card, paddingVertical: 15, paddingHorizontal: 15, borderRadius: 12, marginBottom: 10 },
  historyIndex: { color: '#666', fontWeight: 'bold', fontSize: 16, width: 30 }
});