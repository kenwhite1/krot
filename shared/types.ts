// Общие DTO между клиентом и сервером.
import type { GameView } from './view'
import type { Difficulty } from './difficulty'
import type { PackId } from './locations'
import type { Team } from './engine'

export interface Profile {
  id: number
  name: string
  wins: number
  losses: number
  played: number
  streak: number
  bestStreak: number
  coins: number
}

export interface RoomPlayerDto {
  id: string
  name: string
  avatar: string
  isBot: boolean
  isHost: boolean
  connected: boolean
}

export interface RoomDto {
  code: string
  hostId: string
  started: boolean
  quick: boolean
  players: RoomPlayerDto[]
  maxPlayers: number
  seats: number // до скольки мест добор ботами (люди + боты)
  pack: PackId
  difficulty: Difficulty
  addBots: boolean
}

// Что получает опрашивающий онлайн-клиент.
export interface RoomStateDto {
  room: RoomDto
  version: number
  view: GameView | null // null пока в лобби
  roundOver: { winner: 'town' | 'mole'; youWon: boolean } | null
}

export type { GameView, Difficulty, PackId, Team }
