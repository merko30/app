import { useState } from "react";
import {
  useColorScheme,
  StyleSheet,
  Dimensions,
  Pressable,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Toast from "react-native-toast-message";
import NetInfo from "@react-native-community/netinfo";
import { Link } from "expo-router";

import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { snapPoint } from "react-native-redash";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Colors } from "@/constants/Colors";
import { Habit } from "@/types";
import { createCompletion, deleteCompletion } from "@/api/completions";

import { ThemedText } from "../ThemedText";
import { ThemedView } from "../ThemedView";
import { deleteHabit } from "@/api/habits";
import { HABITS_STORAGE_KEY } from "@/constants";

import {
  INITIAL_POSITION,
  SNAP_POINTS,
  getPosition,
  syncPendingCompletions,
  savePendingCompletion,
  ICONS_WIDTH,
  HEIGHT,
  PendingCompletion,
  frequencyColors,
} from "./utils";

const { width: wWidth } = Dimensions.get("window");

interface HabitWithCompletionId extends Habit {
  todays_completion_id?: number | null;
}

const HabitItem = ({ habit: _habit }: { habit: HabitWithCompletionId }) => {
  const [habit, setHabit] = useState<HabitWithCompletionId>(_habit);
  const colorScheme = useColorScheme();

  const shouldRemove = useSharedValue<0 | 1>(0);
  const position = useSharedValue(INITIAL_POSITION);

  const onDeleteHabit = async () => {
    try {
      await deleteHabit(habit.id);

      shouldRemove.value = 1;
      position.value = withTiming(-wWidth, { duration: 300 });
    } catch (error: any) {
      console.log("Error deleting habit:", error.message);
      const localHabits = await AsyncStorage.getItem(HABITS_STORAGE_KEY);
      if (localHabits) {
        const habits = JSON.parse(localHabits);
        const updatedHabits = habits.map((h: Habit) =>
          h.id === habit.id ? { ...h, deleted: true } : h
        );
        console.log("Updated habits after deletion:", updatedHabits);

        await AsyncStorage.setItem(
          HABITS_STORAGE_KEY,
          JSON.stringify(updatedHabits)
        );
      }
    }
  };

  const onDelete = () => {
    "worklet";
    runOnJS(onDeleteHabit)();
  };

  const panGesture = Gesture.Pan()
    .failOffsetY(10)
    .failOffsetX(10)
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      // goes to the left
      if (e.translationX < 0) {
        position.value = e.translationX;
      }
    })
    .onEnd((e) => {
      // finds the closest snap point
      // to the current position
      const to = snapPoint(position.value, e.velocityX, SNAP_POINTS);
      console.log("Snap point:", to);
      // handle swipe delete
      if (to === -wWidth) {
        shouldRemove.value = 1;
        position.value = withTiming(-wWidth, { duration: 300 });
        onDelete();
      } else if (to === -ICONS_WIDTH) {
        position.value = getPosition(-ICONS_WIDTH);
      } else {
        position.value = getPosition(INITIAL_POSITION);
      }
    });

  const height = useDerivedValue(() =>
    shouldRemove.value === 1 ? withTiming(0, { duration: 300 }) : HEIGHT
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
    height: height.value,
    zIndex: position.value > -50 ? 20 : -1,
  }));

  const updateStorage = async (habit: Habit) => {
    const habitsFromStorage = await AsyncStorage.getItem(HABITS_STORAGE_KEY);
    if (habitsFromStorage) {
      const habits = JSON.parse(habitsFromStorage);
      const updatedHabits = habits.map((h: Habit) =>
        h.id === habit.id
          ? {
              ...h,
              completed_today: !h.completed_today,
              streak_count: h.completed_today
                ? h.streak_count - 1
                : h.streak_count + 1,
            }
          : h
      );
      await AsyncStorage.setItem("habits", JSON.stringify(updatedHabits));
    }
  };

  const onComplete = async () => {
    const netState = await NetInfo.fetch();
    // Determine date format based on frequency
    let date: string;
    if (habit.frequency === "weekly") {
      const now = new Date();
      const weekNumber = Math.ceil(
        ((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) /
          86400000 +
          1) /
          7
      );
      date = `${now.getFullYear()}-W${weekNumber.toString().padStart(2, "0")}`;
    } else if (habit.frequency === "monthly") {
      const now = new Date();
      date = `${now.getFullYear()}-${(now.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
    } else {
      // daily
      date = new Date().toISOString().split("T")[0];
    }
    const completion: PendingCompletion = {
      habit_id: habit.id,
      date,
      completed: !habit.completed_today,
      frequency: habit.frequency,
    };
    if (!netState.isConnected) {
      await updateStorage(habit);
      await savePendingCompletion(completion);
      Toast.show({
        type: "info",
        text1: "Offline Mode",
        text2: "Changes will sync when online.",
      });
      setHabit((old) => ({
        ...old,
        completed_today: !old.completed_today,
        streak_count: old.completed_today
          ? old.streak_count - 1
          : old.streak_count + 1,
      }));
      return;
    }
    try {
      setHabit((old) => ({
        ...old,
        completed_today: !old.completed_today,
        streak_count: old.completed_today
          ? old.streak_count - 1
          : old.streak_count + 1,
      }));
      if (habit.completed_today && habit.todays_completion_id) {
        await deleteCompletion(habit.todays_completion_id);
      } else {
        await createCompletion(completion);
      }
      await syncPendingCompletions();
    } catch {
      await updateStorage(habit);
      await savePendingCompletion(completion);
      setHabit((old) => ({
        ...old,
        completed_today: !old.completed_today, // Revert the completion state
        streak_count: old.completed_today
          ? old.streak_count + 1
          : old.streak_count - 1,
      }));
    }
  };

  return (
    <>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.wrapper, animatedStyle]}>
          <ThemedView
            style={[
              styles.item,
              {
                width: wWidth,
                borderLeftWidth: 6,
                borderLeftColor: frequencyColors[habit.frequency] || "#bbb",
              },
            ]}
          >
            <ThemedView style={styles.titleContainer}>
              <MaterialIcons
                size={32}
                name={
                  habit.completed_today
                    ? "check-circle"
                    : "radio-button-unchecked"
                }
                onPress={onComplete}
                color={
                  Colors[colorScheme ?? "light"][
                    habit.completed_today ? "tint" : "text"
                  ]
                }
              />
              <Link href={{ pathname: "/list/[id]", params: { id: habit.id } }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <ThemedText style={styles.itemTitle}>
                    {habit.title}
                  </ThemedText>
                  {(habit.updated ||
                    habit.id.toString().includes("offline")) && (
                    <MaterialIcons
                      name="sync"
                      size={16}
                      color={Colors[colorScheme ?? "light"].text}
                    />
                  )}
                </View>
              </Link>
            </ThemedView>
            <ThemedView
              style={[
                styles.count,
                { backgroundColor: Colors[colorScheme ?? "light"].tint },
              ]}
            >
              <ThemedText style={styles.streakCount}>
                {habit.streak_count}
              </ThemedText>
            </ThemedView>
          </ThemedView>
          <Pressable
            style={{
              backgroundColor: "#f44336",
              width: ICONS_WIDTH,
              justifyContent: "center",
              alignItems: "center",
            }}
            onPress={onDeleteHabit}
          >
            <MaterialIcons size={32} name="delete" color="white" />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 4,
    height: HEIGHT,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemTitle: {
    fontWeight: "500",
  },
  count: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  streakCount: {
    color: "white",
  },
});

export default HabitItem;
