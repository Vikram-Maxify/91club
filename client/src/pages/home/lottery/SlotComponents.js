import { useEffect, useRef, useState } from "react";

import AllIcon from "../../../assets/tiranga/AllIcon.png";
import AllActiveIcon from "../../../assets/tiranga/allactiveicon.png";
import CasinoIcon from "../../../assets/tiranga/casino.svg";
import CasinoActiceIcon from "../../../assets/tiranga/casinoactive.png";
import FishingIcon from "../../../assets/tiranga/fishing.svg";
import LobbyIcon from "../../../assets/tiranga/lobby.svg";
import LobbyActiveIcon from "../../../assets/tiranga/lobbyactive.svg";
import FishingActiveIcon from "../../../assets/tiranga/fishingactive.png";
import originalIcon from "../../../assets/tiranga/originalIcon.png";
import originalActiveIcon from "../../../assets/tiranga/originalactive.png";
import lotteryactive from "../../../assets/tiranga/wingoactive.png";
import LotteryIcon from "../../../assets/tiranga/lottery.png";
// import RummyIcon from "../../../assets/tiranga/rummy.png";
import SlotsIcon from "../../../assets/tiranga/slot.svg";
import SlotsActiveIcon from "../../../assets/tiranga/slotactive.svg";
import SportIcon from "../../../assets/tiranga/sport.svg";
import SportActiveIcon from "../../../assets/tiranga/sportactive.svg";

import { rechargeList2 } from "../../../store/reducer/userReducer";
import SportsComponent from "./SportsComponent";

import { useDispatch } from "react-redux";
import { notification } from "../../../store/reducer/activityReducer";

import { Link, useNavigate } from "react-router-dom";
import CasinoLiveGame from "../newgame/CasinoLiveGame";
import FishingGame from "../newgame/FishingGame";
import OriginalGame from "../newgame/OriginalGame";
import Popular from "../newgame/Popular";
import RecommendSlider from "../newgame/RecommendSlider";
import Slots from "../newgame/Spots";
import PVCSection from "./PVCSection";

const allCategories = [
  {
    name: "Lobby",
    icon: LobbyIcon,
    activeIcon: LobbyActiveIcon,
    id: "lobby",
  },
  {
    name: "Lottery",
    icon: LotteryIcon,
    activeIcon: lotteryactive,
    id: "lottery",
  },
  {
    name: "Original",
    icon: originalIcon,
    activeIcon: originalActiveIcon,
    id: "orignal",
  },
  {
    name: "Slots",
    icon: SlotsIcon,
    activeIcon: SlotsActiveIcon,
    id: "slots",
  },
  {
    name: "Sports",
    icon: SportIcon,
    activeIcon: SportActiveIcon,
    id: "sports",
  },
  {
    name: "Casino",
    icon: CasinoIcon,
    activeIcon: CasinoActiceIcon,
    id: "casino",
  },
  {
    name: "Fishing",
    icon: FishingIcon,
    activeIcon: FishingActiveIcon,
    id: "fishing",
  },
  {
    name: "All",
    icon: AllIcon,
    activeIcon: AllActiveIcon,
    id: "all",
  },
];

const SlotComponents = () => {
  const dispatch = useDispatch();

  const [activeCategory, setActiveCategory] = useState("jili");
  const [alertsuccess, setAlertsuccess] = useState(false);

  const categoryRef = useRef();
  const contentRef = useRef(null);

  const [repopup, setRepopup] = useState(false);
  const navigate = useNavigate();

  const data = localStorage.getItem("topup");
  const data22 = localStorage.getItem("topup22");
  const [tabs, setTabs] = useState("lottery"); // Default "lottery"

  const handleCategoryClick = (category) => {
    setActiveCategory(category);
  };

  useEffect(() => {
    dispatch(notification());
  }, []);

  // TEMPORARY: removed recharge check – navigate directly to game
  const handleWingo = (path) => {
    navigate(path);
  };

  useEffect(() => {
    const section = document.getElementById(tabs);
    if (section) {
      const yOffset = -80;
      const y =
        section.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, [tabs]);

  const handleCloseRecharge = () => {
    navigate("/wallet/Recharge", {
      state: {
        autoPay: true,
        amount: 200,
        type: "UPI-QR",
      },
    });
    setRepopup(false);
  };

  const handleClick = (category) => {
    const element = document.getElementById(category.id);
    if (element) {
      const yOffset = -100;
      const y =
        element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    setTabs(category.id);
  };

  return (
    <div className="container-section mt-5 relative">
      <div className="bg-white">
        <div className={`place-bet-popup z-40 ${alertsuccess ? "active" : ""}`}>
          <div className="text-lg">
            {"Need first recharge to Play the Game"}
          </div>
        </div>
      </div>

      {/* lottery tabs  */}
      <div className="w-full p-2 rounded-md top-0 z-50 bg-white">
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 items-center w-max">
            {allCategories.map((cat) => {
              const isActive = tabs === cat.id;

              return (
                <div
                  key={cat.id}
                  onClick={() => setTabs(cat.id)}
                  className="flex flex-col items-center cursor-pointer"
                >
                  <div
                    className={`min-w-[0px] rounded-xl flex flex-row items-center justify-center px-3 py-1 transition ${isActive ? "bg-white shadow-lg" : ""
                      }`}
                  >
                    <img
                      src={isActive && cat.activeIcon ? cat.activeIcon : cat.icon}
                      alt={cat.name}
                      className="w-5 h-5 mr-2"
                    />

                    <p
                      className={`${isActive
                        ? "text-black font-semibold text-lg"
                        : "text-gray-500"
                        }`}
                    >
                      {cat.name}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        {/* LOBBY Section */}
        {tabs === "lobby" && (
          <div id="lobby" className="mt-2">
            {/* lottery Section*/}
            <div id="lottery" className="mt-3">
              <div className="flex justify-between pb-3">
                <div className="flex">
                  <img
                    src="https://i.ibb.co/CKq5YKWn/logo8.jpg"
                    alt=""
                    className="w-7 h-7 rounded-full"
                  />
                  <h4 className="border-after text-black font-bold pl-2">
                    Lottery
                  </h4>
                </div>
                <Link to={"/home/AllOnlineGames?game=Lottery"}>
                  <button className="ml-3 bg-green-300/20 text-green-400 px-3 py-0 rounded-xl border border-green-300 gray-100">
                    All 4
                  </button>
                </Link>
              </div>
              {/* Row 1 → 3 images */}
              <div className="grid grid-cols-2 gap-2">
                {gameData.slice(0, 6).map((game) => (
                  <img
                    key={game.id}
                    src={game.image}
                    alt={game.name}
                    onClick={() => handleWingo(game.link)}
                    className="w-48 h-full object-cover rounded-xl cursor-pointer hover:opacity-90 transition"
                  />
                ))}
              </div>

              {/* Row 2 → 1 image */}
              {/* <div className="grid grid-cols-3 mt-3">
                {gameData.slice(3, 4).map((game) => (
                  <img
                    key={game.id}
                    src={game.image}
                    alt={game.name}
                    onClick={() => handleWingo(game.link)}
                    className="w-full h-40 object-cover rounded-xl cursor-pointer hover:opacity-90 transition"
                  />
                ))}
              </div> */}
            </div>

            {/* Popular Section */}
            <div id="popular" className="mt-2">
              <div className="flex justify-between items-center"></div>
              <RecommendSlider />
              <Popular />
            </div>

            {/* Casino Section */}
            <div id="casino" className="mt-2">
              <div className="flex justify-between items-center"></div>
              <CasinoLiveGame />
            </div>

            {/* Slots Section */}
            <div id="slots">
              <div className="flex justify-between items-center"></div>
              <Slots />
            </div>

            {/* Original Section */}
            <div id="orignal" className="lottery-game-section">
              <OriginalGame />
            </div>

            {/* Sports Section */}
            <div>
              <SportsComponent />
            </div>

            {/* Fishing Section */}
            <div id="fishing" className="lottery-game-section">
              <FishingGame />
            </div>

            {/* PVC Section */}
            <div id="rummy" className="mt-2">
              <PVCSection />
            </div>
          </div>
        )}

        {/* lottery Section*/}
        {(tabs === "lottery" || tabs === "all") && (
          <div id="lottery" className="mt-3">
            <div className="flex justify-between pb-3">
              <div className="flex">
                <img
                  src="https://i.ibb.co/CKq5YKWn/logo8.jpg"
                  alt=""
                  className="w-7 h-7 rounded-full"
                />
                <h4 className="border-after text-black font-bold pl-2">
                  Lottery
                </h4>
              </div>
              <Link to={"/home/AllOnlineGames?game=Lottery"}>
                <button className="ml-3 bg-white text-red-400 px-3 py-0 rounded-xl border border-red-300 gray-100">
                  All 4
                </button>
              </Link>
            </div>
            {/* Row 1 → 3 images */}
            <div className="grid grid-cols-2 gap-3">
              {gameData.slice(0, 5).map((game) => (
                <img
                  key={game.id}
                  src={game.image}
                  alt={game.name}
                  onClick={() => handleWingo(game.link)}
                  className=" object-contain rounded-xl cursor-pointer hover:opacity-90 transition"
                />
              ))}
            </div>

            {/* Row 2 → 1 image */}
            {/* <div className="grid grid-cols-2 gap-3 mt-3">
              {gameData.slice(3, 4).map((game) => (
                <img
                  key={game.id}
                  src={game.image}
                  alt={game.name}
                  onClick={() => handleWingo(game.link)}
                  className="object-contain rounded-xl cursor-pointer hover:opacity-90 transition"
                />
              ))}
            </div> */}
          </div>
        )}
        {/*  */}
        {tabs === "slots" && (
          <div id="slots">
            <div className="flex justify-between items-center"></div>
            <Slots />
          </div>
        )}
        {/*  */}
        {/* <div className=" overflow-hidden">
          <div ref={contentRef} className="transition-all duration-300">
            {activeCategory === "jili" && (
              <div>
                <JilliGame />
              </div>
            )}
            {activeCategory === "cq9" && <Cq9Game />}
            {activeCategory === "jdb" && <JDBGame />}
            {activeCategory === "mg" && <MGGame />}
            {activeCategory === "evo_ele" && <EVOGame />}
            {activeCategory === "g9" && <G9Game />}
            {activeCategory === "pg" && <PGGame />}
            {activeCategory === "mg_fish" && <MGfishGame />}
          </div>
        </div> */}
        {tabs === "all" && (
          <div id="popular" className="mt-2">
            <div className="flex justify-between items-center"></div>
            <RecommendSlider />
            <Popular />
            <CasinoLiveGame />
            <Slots />
            <OriginalGame />
            <SportsComponent />
          </div>
        )}
        {tabs === "popular" && (
          <div id="popular" className="mt-2">
            <div className="flex justify-between items-center"></div>
            {/* <CasinoSection /> */}
            <RecommendSlider />
            <Popular />
          </div>
        )}

        {tabs === "casino" && (
          <div id="casino" className="mt-2">
            <div className="flex justify-between items-center"></div>
            <CasinoLiveGame />
            {/* <CasinoSection /> */}
          </div>
        )}

        {/* {tabs === "rummy" && (
          <div id="rummy" className="mt-2">
            <div className="flex justify-between items-center"></div>
            <Rummy />
          </div>
        )} */}

        {tabs === "orignal" && (
          <div id="orignal" className="lottery-game-section">
            <OriginalGame />
          </div>
        )}
        {tabs === "fishing" && (
          <div id="fishing" className="lottery-game-section">
            <FishingGame />
            {/* <ChikenRoad /> */}
          </div>
        )}
        {tabs === "sports" && (
          <div>
            <SportsComponent />
          </div>
        )}
        {tabs === "rummy" && (
          <div id="rummy" className="mt-2">
            <PVCSection />
            {/* <Rummy /> */}
          </div>
        )}

        {/* orignal */}

        {/* <div id="orignal" className="mt-4">
          <div className="flex justify-between items-center"></div>
          <OriginalGame />
        </div> */}
        {/* fishing */}

        {/* <div id="fishing" className="mt-2">
          <div className="flex justify-between items-center"></div>
          <FishingGame />
        </div> */}
        {/* casino */}

        {/* sports & pvc */}

        {/* <div id="sports" className="mt-2">
          <div className="flex justify-between items-center"></div>
          <SportsComponent />
        </div>
        <div id="pvc" className="mt-2">
          <div className="flex justify-between items-center"></div>
          <PVCSection />
        </div> */}
        {/* jackpot */}
        {/* <div id="jackpot" className="mt-2">
          <div className="flex justify-between items-center"></div>
          <SuperJackportGame />
        </div> */}
      </div>
      <div
        className={repopup ? "overlay-section block z-[50]" : "hidden"}
      ></div>
      {repopup && (
        <div className="fixed top-0 z-[60] bottom-0 pb-2 h-32 m-auto flex flex-col justify-center items-center left-0 right-0 w-[20rem] bg-light rounded-lg">
          <h3 className="heading-h3 gray-50 mt-5">Tips</h3>
          <p className="text-sm text-whites mt-2">
            First need to recharge <span className="text-green-400">₹200</span>{" "}
            for this game
          </p>

          <div className="w-full mt-5">
            <button
              className=" text-gray-400 p-2 w-[50%]  rounded-bl-lg "
              onClick={() => setRepopup(false)}
            >
              Cancel
            </button>
            <button
              className="p-2 text-blue rounded-br-lg  w-[50%]"
              onClick={handleCloseRecharge}
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlotComponents;
const gameData = [
  {
    id: 1,
    name: "Win Go",
    image: "https://i.ibb.co/tMqMBM5D/lottery4.png",
    description1: "Guess Number",
    description2: "Green/Red/Violet to win",
    link: "/wingo",
  },
  {
    id: 2,
    name: "K3",
    image: "https://i.ibb.co/zT2cWbyv/lottery2.png",
    description1: "Guess Number",
    description2: "Big/Small/Odd/Even",
    link: "/k3",
  },
  {
    id: 3,
    name: "5D",
    image: "https://i.ibb.co/rKnvxzf7/lottery1.png",
    description1: "Guess Number",
    description2: "Big/Small/Odd/Even",
    link: "/5d",
  },
  {
    id: 4,
    name: "Trx Win Go",
    image: "https://i.ibb.co/F4Sk42Tb/lottery3.png",
    description1: "Guess Number",
    description2: "Green/Red/Violet to win",
    link: "/trx",
  },
  {
    id: 5,
    name: "Moto Racing",
    image: "https://i.ibb.co/VWvxmjQ7/lottery5.png",
    description1: "Guess Number",
    description2: "Green/Red/Violet to win",
    link: "/trx",
  },
];