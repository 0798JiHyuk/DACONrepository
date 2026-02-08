import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { trainingShortRoutes } from "./trainingShort.routes";
import { trainingLongRoutes } from "./trainingLong.routes";
import { experienceRoutes } from "./experience.routes";
import { feedbackRoutes } from "./feedback.routes";
import { reportsRoutes } from "./reports.routes";

export const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/training", trainingShortRoutes);
routes.use("/training", trainingLongRoutes);
routes.use("/experience", experienceRoutes);
routes.use("/feedback", feedbackRoutes);
routes.use("/reports", reportsRoutes);
