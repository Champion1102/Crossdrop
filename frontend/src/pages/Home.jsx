import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import WorldMap from "../components/ui/world-map";

const Home = () => {
  const navigate = useNavigate();

  const handleSearchClick = () => {
    // Navigate to the transfer page
    navigate("/transfer");
  };

  // Sample connection dots for world map
  const worldMapDots = [
    {
      start: { lat: 64.2008, lng: -149.4937 }, // Alaska
      end: { lat: 34.0522, lng: -118.2437 }, // Los Angeles
    },
    {
      start: { lat: 51.5074, lng: -0.1278 }, // London
      end: { lat: 28.6139, lng: 77.209 }, // New Delhi
    },
    {
      start: { lat: 35.6762, lng: 139.6503 }, // Tokyo
      end: { lat: -33.8688, lng: 151.2093 }, // Sydney
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Hero Section with World Map */}
      <section className="relative py-40 dark:bg-black bg-white w-full">
        <div className="max-w-7xl mx-auto text-center px-4">
          <motion.div
            className="relative inline-block"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.p 
              className="font-bold text-4xl md:text-7xl lg:text-8xl dark:text-white text-black mb-2 relative overflow-hidden inline-block"
            >
              <span className="relative z-10">Cross</span>{" "}
              <span className="text-neutral-400 relative z-10">
                {"Drop".split("").map((word, idx) => (
                  <motion.span
                    key={idx}
                    className="inline-block"
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.5, delay: idx * 0.04 }}
                  >
                    {word}
                  </motion.span>
                ))}
              </span>
              {/* Shine effect overlay - adapts to light/dark mode */}
              <motion.span
                className="absolute inset-0 pointer-events-none"
                style={{
                  width: "30%",
                  height: "100%",
                }}
                animate={{
                  x: ["-50%", "350%"],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  repeatDelay: 2,
                  ease: "easeInOut",
                }}
              >
                {/* Light mode: blue gradient shine */}
                <span
                  className="block w-full h-full dark:hidden"
                  style={{
                    background: "linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.6) 45%, rgba(59,130,246,0.6) 55%, transparent 100%)",
                  }}
                />
                {/* Dark mode: white gradient shine */}
                <span
                  className="hidden dark:block w-full h-full"
                  style={{
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 45%, rgba(255,255,255,0.8) 55%, transparent 100%)",
                  }}
                />
              </motion.span>
            </motion.p>
          </motion.div>
          <motion.p 
            className="text-sm md:text-lg text-neutral-500 max-w-2xl mx-auto py-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Seamless file sharing across your local network. Connect devices instantly,
            transfer files securely, and experience modern peer-to-peer connectivity.
          </motion.p>
        </div>

        {/* World Map with Search Icon */}
        <div className="relative mt-12 w-full">
          <WorldMap dots={worldMapDots} lineColor="#0ea5e9" />
          
          {/* Search Icon Button in Center - moved higher */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Pulsing Ring Effect - positioned behind button */}
            <motion.div
              className="absolute rounded-full bg-blue-500"
              animate={{
                scale: [1, 2.5, 1],
                opacity: [0.3, 0, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeOut",
              }}
              style={{
                width: "80px",
                height: "80px",
                top: "30%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 1,
              }}
            />
            {/* Search Icon Button - positioned on top */}
            <motion.button
              onClick={handleSearchClick}
              className="absolute w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full shadow-2xl flex items-center justify-center text-white text-2xl hover:scale-110 transition-transform pointer-events-auto cursor-pointer"
              style={{
                top: "30%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 10,
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              initial={{ scale: 0 }}
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{
                delay: 0.5,
                scale: {
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
            >
              🔍
            </motion.button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
