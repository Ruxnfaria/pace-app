export const GAMIFICATION_CONFIG = {
    xp: {
      workoutCompleted: 100,
      extraWorkoutCompleted: 60,
  
      proteinGoalReached: 40,
      caloriesGoalReached: 30,
      waterGoalReached: 30,
      cardioCompleted: 50,
      weightRegistered: 15,
  
      dailyPlanCompleted: 75,
      weeklyMissionCompleted: 300,
  
      streak7Days: 150,
      streak14Days: 250,
      streak30Days: 500,
    },
  
    levels: {
      maxLevel: 100,
  
      tiers: [
        {
          minLevel: 1,
          maxLevel: 10,
          xpPerLevel: 500,
        },
        {
          minLevel: 11,
          maxLevel: 20,
          xpPerLevel: 750,
        },
        {
          minLevel: 21,
          maxLevel: 30,
          xpPerLevel: 1000,
        },
        {
          minLevel: 31,
          maxLevel: 50,
          xpPerLevel: 1500,
        },
        {
          minLevel: 51,
          maxLevel: 100,
          xpPerLevel: 2000,
        },
      ],
    },
  
    streak: {
      minimumDailyActions: 1,
      gracePeriodHours: 4,
      freezeLimit: 1,
    },
  
    missions: {
      daily: {
        maximumActive: 4,
      },
  
      weekly: {
        maximumActive: 3,
      },
  
      monthly: {
        maximumActive: 2,
      },
    },
  
    leagues: {
      usersPerGroup: 30,
      promotionPositions: 5,
      demotionPositions: 5,
    },
  } as const;