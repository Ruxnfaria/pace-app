export interface Database {
    public: {
      Tables: {
        profiles: {
          Row: {
            id: string
            user_id: string
            name: string | null
            email: string | null
            avatar_url: string | null
            goal: string | null
            fitness_level: string | null
            weight: number | null
            height: number | null
            age: number | null
            gender: string | null
            available_days: number
            xp: number
            streak: number
            created_at: string
            updated_at: string
          }
        }
        workouts: {
          Row: {
            id: string
            user_id: string
            name: string
            muscle_group: string | null
            exercises: any | null // JSONB
            completed: boolean
            completed_at: string | null
            xp_earned: number
            created_at: string
          }
        }
        nutrition_logs: {
          Row: {
            id: string
            user_id: string
            meal_name: string
            calories: number | null
            protein: number | null
            carbs: number | null
            fat: number | null
            logged_at: string
          }
        }
        body_measurements: {
          Row: {
            id: string
            user_id: string
            weight: number | null
            waist: number | null
            hip: number | null
            chest: number | null
            measured_at: string
          }
        }
        missions: {
          Row: {
            id: string
            user_id: string
            title: string
            description: string | null
            xp_reward: number
            completed: boolean
            type: string
            expires_at: string | null
            created_at: string
          }
        }
        chat_messages: {
          Row: {
            id: string
            user_id: string
            role: string
            content: string
            created_at: string
          }
        }
      }
    }
  }