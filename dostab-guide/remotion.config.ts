import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");   // PNG frames are the slow part on this machine
Config.setOverwriteOutput(true);
Config.setConcurrency(2);             // under a gigabyte free; more tabs means crashes
