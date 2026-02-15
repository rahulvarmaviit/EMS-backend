-- CreateTable
CREATE TABLE "game_scores" (
    "id" TEXT NOT NULL,
    "game_name" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "moves" INTEGER,
    "time_taken" INTEGER,
    "played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "game_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_scores_game_name_score_idx" ON "game_scores"("game_name", "score" DESC);

-- AddForeignKey
ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
