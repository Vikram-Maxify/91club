import { useCallback, useEffect, useState } from "react";
import { RxCrossCircled } from "react-icons/rx";
// import Slider from "react-slick";
import "./home.css";

import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";

import { Swiper, SwiperSlide } from "swiper/react";

// Import Swiper styles
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { Autoplay } from "swiper/modules";

import debounce from "lodash/debounce";
import { RiVolumeUpFill } from "react-icons/ri";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import Slider from "react-slick";
import MainLoader from "../../components/MainLoader";
import Layout from "../../layout/Layout";
import { userDetail } from "../../store/reducer/authReducer";
import { recharheBonus } from "../../store/reducer/userReducer";

import WinningInformation from "./WinningInformation";

import Cookies from "js-cookie";
import { BsFire } from "react-icons/bs";
import WheelSpinImg from "../../assets/wheelspin.png";
import bonusSpin from "../../assets/yarwin/bonus.png";
import wheelSpin from "../../assets/yarwin/wheelSpin.png";
import { totalCommission } from "../../store/reducer/promotionReducer";
import { Alerts } from "./Alerts";
import Apkdownload from "./Apkdownload";
import PlatformDetails from "./lottery/PlatformDetails";
import SlotComponents from "./lottery/SlotComponents";

const Home = () => {
  const { userInfo } = useSelector((state) => state.auth);
  const { bannergetData, rechargeBonusData } = useSelector(
    (state) => state.user,
  );
  const { totalCommissionData } = useSelector((state) => state.promotion);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isChecked, setIsChecked] = useState(true);
  const [topup, setTopup] = useState(false);
  const [topup2, setTopup2] = useState(false);
  const [topup3, setTopup3] = useState(false);
  const [topup4, setTopup4] = useState(false);
  const [mainLoader, setMainloader] = useState(false);
  const [apps, setApp] = useState(true);

  const handleCheckboxChange = () => {
    setIsChecked(!isChecked);
  };

  useEffect(() => {
    dispatch(recharheBonus());
  }, [dispatch]);

  const debouncedDispatch = useCallback(
    debounce(() => {
      dispatch(userDetail());
    }), // Adjust the debounce delay as needed
    [dispatch],
  );
  useEffect(() => {
    debouncedDispatch(); // Call the debounced dispatch function
    window.scrollTo(0, 0);
    const data = localStorage.getItem("topup");

    if (data == "true") {
      setTopup(true);
    }
  }, [debouncedDispatch]); // Empty dependency array ensures it runs only once
  const handleTopup = () => {
    localStorage.setItem("topup", false);
    setTopup(false);
    setTopup2(true);
  };

  useEffect(() => {
    const data = localStorage.getItem("app");

    if (data === "closed") {
      setApp(false);
    } else {
      setApp(true);
    }

    dispatch(totalCommission());
  }, []);

  useEffect(() => {
    // Function to handle when the page has fully loaded
    const handleLoad = () => {
      //console.log("Loading complete.");
      setMainloader(false);
    };

    if (performance.getEntriesByType("navigation")[0].type === "navigate") {
      //console.log("Loading started in a new tab...");

      setMainloader(true);
      setTimeout(() => {
        setMainloader(false);
      }, 1000);
      window.addEventListener("load", handleLoad);
    }

    return () => {
      window.removeEventListener("load", handleLoad);
    };
  }, []);

  useEffect(() => {
    if (topup || topup2 || topup3 || topup4) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "auto"; // or 'visible' depending on your default
    };
  }, [topup2, topup, topup3, topup4]);

  const notices = {
    infinite: true,
    slidesToShow: 1,
    slidesToScroll: 1,
    vertical: true,
    autoplay: true,
    autoplaySpeed: 4000,
    verticalSwiping: true,
    arrows: false, // This removes the arrows
    cssEase: "linear", // Smooth scrolling effect
  };

  const [showPopup, setShowPopup] = useState(false);
  const handleReceive = () => {
    setShowPopup(false);
  };

  return (
    <Layout>
      <div
        style={{
          position: "fixed",
          zIndex: 500,
        }}
        className="flex flex-col right-0 bottom-36"
      >
        {/* 🔐 WheelSpin Protected */}
        <div
          style={{ display: "inline-block", cursor: "pointer" }}
          onClick={() => {
            if (userInfo) {
              navigate("/WheelSpin");
            } else {
              navigate("/login");
            }
          }}
        >
          <img src={WheelSpinImg} alt="Service" className="w-20" />
          <img
            src="https://i.ibb.co/d0M6CdWR/reward-Center-BO-n76h-A.png"
            alt="Service"
            className="w-16"
          />
        </div>

        {/* 🔗 Telegram (Open Always) */}
        {/* <Link to={userInfo?.telegram} style={{ display: "inline-block" }}>
          <img src="/telegram.png" alt="Service" className="w-20" />
        </Link> */}
      </div>

      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-[#f0f0f0] rounded-2xl shadow-xl p-4 w-[21rem] text-center relative">
            <img
              src="https://i.ibb.co/NdLQwsCh/popup-img-01.png"
              alt=""
              className="absolute w-[9rem] right-0 left-0 flex m-auto top-[-25px]"
            />

            {/* Right Tick Icon */}
            {/* <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-r from-green-400 to-yellow-300 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-black"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div> */}

            {/* Marvelous Message */}
            <h2 className="text-xl font-semibold text-gray-800 mb-2 pt-20">
              marvelous!
            </h2>
            <p className="text-gray-500 mb-2 font-normal text-sm">
              Your invitation reward has been settled
            </p>

            {/* Commission Display */}
            <div className="flex items-center justify-center gap-1 text-2xl font-normal text-yellow-700 mb-6">
              <span className="text-gray-500 text-sm">Commission</span>
              <span className="text-base">
                {totalCommissionData?.yesterdayBalance?.toFixed(2)}
              </span>
            </div>

            {/* Receive Button */}
            <button
              onClick={handleReceive}
              className="w-[80%] py-1 rounded-3xl text-black text-xl font-bold  blue-linear"
            >
              Receive
            </button>
          </div>
        </div>
      )}

      <div className="z-40 bg-gradient-to-l pb-5">
  <div className="flex items-center justify-between rounded-md px-3">
    <div className="logo py-2 flex flex-col items-start">
      {/* Logo */}
      <img
        src={bannergetData?.gameall?.logo}
        alt="loading img"
        loading="lazy"
        className="w-[200px]"
      />
    </div>

    {userInfo ? (
      <div className="flex gap-2 items-center my-0.5">
        <img
          src="https://i.ibb.co/qMgWb30K/icon-Download-CAVOF-9-C.png"
          alt=""
          loading="lazy"
          className="w-7"
        />

        <Link
          className="flex justify-between items-center"
          to={`https://h5support.expressclub.site/?token=${Cookies.get(
            "auth"
          )}`}
        >
          <div>
            <img
              src="https://i.ibb.co/0VnqD47C/message-Icon-Dzj8-Mws-M.png"
              alt=""
              loading="lazy"
              className="w-7"
            />
          </div>
        </Link>
      </div>
    ) : (
      <div className="text-black flex justify-center gap-2">
        <button
          onClick={() => navigate("/login")}
          className="bg-white text-black px-3 py-1.5 rounded-md w-[70px] h-[34px] border border-gray-400 font-bold"
        >
          Log in
        </button>

        <button
          onClick={() => navigate("/register")}
          className="bg-[#FB5755] text-white px-3 py-1.5 rounded-md w-[80px] h-[34px]"
        >
          Register
        </button>
      </div>
    )}
  </div>
</div>

      <Alerts />

      {mainLoader && <MainLoader />}

      {/* notice board */}
      <div className="banner-notice mb-4 px-3 bg-body shadow-lg mt-[0.5rem] rounded-full flex items-center justify-between">
        <RiVolumeUpFill className="text-lg text-blue absolute" />
        <div className="slider-container h-[33px] ms-6 mr-2 overflow-hidden">
          <Slider {...notices}>
            <div>
              <h3 className="text-[12px] leading-[1rem]  text-black">
                Welcome to the {bannergetData?.gameall?.name}! Greetings, Gamers
                and Enthusiasts! The {bannergetData?.gameall?.name}
              </h3>
            </div>
            <div>
              <h3 className="text-[12px] leading-[1rem] text-black">
                If your deposit not receive, please send it directly to{" "}
                {bannergetData?.gameall?.name} Self-service Center
              </h3>
            </div>
            <div>
              <h3 className="text-[12px] leading-[1rem] text-[#808A9F]">
                Please be sure to always use our official website for playing
                the games with the following link, phishing links
              </h3>
            </div>
          </Slider>
        </div>

        <span className="float-end text-xl  relative mr-2">
          <Link
            to={"/main/Notification"}
            className="flex items-center blue-linear p-2 rounded-2xl px-3"
          >
            <BsFire className="text-white mr-1 fs-sm" />{" "}
            <span className="text-white font-semibold fs-sm">Detail</span>
          </Link>

          {/* <div className="ponter-event"></div> */}
        </span>
      </div>

      {/* bannner */}
      <div className="container-section ">
        <div className="home-slider-banner">
          <Swiper
            spaceBetween={30}
            centeredSlides={true}
            autoplay={{
              delay: 2500,
              disableOnInteraction: false,
            }}
            modules={[Autoplay]}
            className="mySwiper h-[184px] rounded-xl overflow-hidden"
          >
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban1}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban2}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>{" "}
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban3}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban4}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban5}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban6}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban7}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban8}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban9}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
            <SwiperSlide>
              <div className="w-full">
                <img
                  src={bannergetData?.data?.ban10}
                  className="w-full rounded-md h-36"
                  alt=""
                  loading="lazy"
                />
              </div>
            </SwiperSlide>
          </Swiper>
        </div>
      </div>

      <div className="flex gap-5 mx-2 mt-2">
        {/* Wheel of Fortune - Redirect to /WheelSpin */}
        <Link to="/WheelSpin" className="relative flex-1 block">
          <img src={wheelSpin} alt="wheelSpin" className="w-full" />
          <p className="absolute inset-0 flex items-center justify-center text-black w-[106px] -mt-4 ml-3 font-bold text-sm md:text-base z-10">
            Wheel of Fortune
          </p>
          <span className="absolute bottom-2 left-4 text-white text-xs font-semibold px-2 py-0.5 rounded z-10">
            View
          </span>
        </Link>

        {/* Welcome Bonus - Redirect to /promotion */}
        <Link to="/promotion" className="relative flex-1 block">
          <img src={bonusSpin} alt="bonusSpin" className="w-full" />
          <p className="absolute inset-0 flex items-center justify-center text-black w-[106px] -mt-4 ml-3 font-bold text-sm md:text-base z-10">
            Welcome Bonus
          </p>
          <span className="absolute bottom-3 left-4 text-white text-xs font-semibold px-2 py-0.5 rounded z-10">
            View
          </span>
        </Link>
      </div>

      <SlotComponents />

      <div className="container-section overflow-x-hidden">
        <WinningInformation />
      </div>
      {/* Basic Tools */}
      {/* <BasicTools /> */}
      {/* Plateform Details */}
      <div>
        <PlatformDetails />
      </div>

      {/* more menu */}

      <div className={topup ? "overlay-section block" : "hidden"}></div>
      <div className={topup2 ? "overlay-section block" : "hidden"}></div>
      <div className={topup3 ? "overlay-section block" : "hidden"}></div>
      <div className={topup4 ? "overlay-section block" : "hidden"}></div>
      {topup && (
        <div className="absolute top-16 left-0 right-0 bg-light flex m-auto flex-col mx-8 pb-1 rounded-xl z-[9999] w-[80%] max-w-md">
          <div className="blue-linear2 text-center p-2 font-bold text-lg rounded-t-xl">
            Welcome To ExpressClub
          </div>

          {/* Image Scroll Area */}
          <div className="h-96 w-full overflow-x-auto overflow-y-auto text-black px-4 text-center">
            <h1>🌟𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐓𝐎 ExpressClub</h1>
            <br />
            <br />
            <span>A secure and rewarding gaming experience starts here.</span>
            <br />
            <span>
              Please make sure you are accessing the official ExpressClub
              website only. Beware of fake platforms, imitation websites, and
              unauthorized agents claiming to represent{" "}
            </span>{" "}
            <b>ExpressClub.</b>
            <b>For your safety:</b>
            <br />
            <ul>
              <li>
                <b>• Always verify our official website link</b>
              </li>
              <li>
                <b>• Never share your login details or OTP with anyone</b>
              </li>
              <li>
                <b>• Contact official support for any assistance</b>
              </li>
              <li>
                <b>• Play responsibly and stay secure</b>
              </li>
              <li>
                <b>💌 Thank you for choosing YourWin</b>
              </li>
              <li>
                <b>We wish you a safe and enjoyable experience!</b>
              </li>
              <li>
                <b>💫 Official URL Click Here Follow US Click Here</b>
              </li>
            </ul>
            {/* <img
              src="https://i.ibb.co/bj9q16kB/popup1.png"
              alt=""
              className="min-w-[320px] w-auto"
            /> */}
          </div>

          <button
            className="flex justify-center text-base m-auto w-40 my-2 text-center blue-linear2 rounded-full p-2 tracking-widest text-color"
            onClick={handleTopup}
          >
            Confirm
          </button>
        </div>
      )}

      {topup3 && (
        <div className="absolute top-20 left-0 right-0 flex m-auto flex-col bg-light mx-8 pb-2 rounded-xl z-[9999]">
          <div className="blue-linear2 text-center p-2 font-bold text-lg text-white rounded-t-xl">
            📢 IMPORTANT NOTICE
          </div>
          <div className="pt-5 py-2 h-96 text-color text-[15px] bg-light overflow-y-auto overflow-x-auto">
            <div className="flex justify-center items-center px-5 h-60 w-full pb-2">
              <img
                src="https://i.ibb.co/tpz8vYys/editor-202508261321441a3u.png"
                alt=""
                className=""
              />
            </div>
            <div className="mx-3 text-gray-900 text-center text-sm">
              <span className="text-[14px]">
                [ .in ] Domain Expiry
                <br />
              </span>
            </div>
            <div className="mx-3 text-gray-900 text-center text-sm mt-6">
              <span className="">Our [ .in ] domains will expire soon.</span>
              <p>
                Please use our{" "}
                <a href="#" className="text-blue-600">
                  Main Domain
                </a>{" "}
                or contact Customer Service / your Upline for the latest active
                domain to avoid service interruption.
              </p>
            </div>
            <div className="flex justify-center mt-5">
              <a href="#" className="uppercase text-[#C86EFf] text-sm">
                Main Download Click Here
              </a>
            </div>
          </div>
          <button
            className=" flex justify-center text-base w-40 blue-linear2 m-auto text-center  rounded-full p-2 tracking-widest text-color"
            onClick={() => {
              setTopup3(false);
              setTopup4(true);
            }}
          >
            Confirm
          </button>
        </div>
      )}
      {topup4 && (
        <div className="absolute top-20 left-0 right-0 flex m-auto flex-col bg-light mx-8 pb-4 rounded-xl z-[9999]">
          <div className="blue-linear2 text-center p-2 font-bold text-lg text-white rounded-t-xl">
            🎁 GIFT CODE 🎁
          </div>
          <div className="pt-5 h-96 text-whites text-[15px] bg-light">
            <span className="flex justify-center">
              ❤️ Your JOY is our PRIORITY ❤️
            </span>
            <h3 className="text-center mt-4">Download ExpressClub APP now</h3>
            <div className="flex  flex-col justify-center items-center px-5 h-40 w-full pb-3">
              <a href="#" className="text-blue-600">
                ➡️DOWNLOAD APP HERE⬅️
              </a>
              <img
                src="https://i.ibb.co/LhCtrCF2/editor-20250825223331njkc.png"
                alt=""
                className=""
              />
            </div>
            <div className="mx-3 text-gray-900 text-center text-base">
              <span className="text-[15px]">
                ⚠️ Don’t miss it !
                <br />
              </span>
            </div>
            <div className="mx-3 text-gray-900 text-center text-base">
              <span className="">
                Daily gift codes waiting for you in the app !
              </span>
              <p>
                🎁 Check the
                <a href="#" className="text-purple-600">
                  Activity Page
                </a>{" "}
                for more bonuses! 🎁
              </p>
            </div>
          </div>
          <button
            className=" flex justify-center text-base w-40 blue-linear2 m-auto text-center  rounded-full p-2 tracking-widest text-color"
            onClick={() => {
              setTopup4(false);
              setTopup2(true);
            }}
          >
            Confirm
          </button>
        </div>
      )}

      {topup2 && (
        <div id="popup" className="popup bg-light">
          <div className="header-section nav-bg text-white">
            <h4>Extra first deposit bonus</h4>
            <p className="mt-2">Each account can only receive rewards once</p>
          </div>
          <div className="middle-content-section">
            <ul>
              {rechargeBonusData?.map((item, i) => (
                <li key={i} onClick={() => navigate("/wallet/Recharge")}>
                  <div className="first-c">
                    <p className="gray-50 text-base">
                      First deposit{" "}
                      <span className="text-[#feaa57]">
                        {item.recAmount.toLocaleString()}
                      </span>
                    </p>
                    <p className="text-[#feaa57]">
                      +₹{item.bonus.toLocaleString()}.00
                    </p>
                  </div>
                  <p className="gray-100 text-xs">
                    Deposit {item.recAmount.toLocaleString()} for the first time
                    in your account and you can receive
                    {(
                      Number(item.recAmount) + Number(item.bonus)
                    ).toLocaleString()}
                  </p>
                  <div className="bottom-c">
                    <div className="slider-box bg-[#ced6e1]">
                      0/{item.recAmount.toLocaleString()}
                    </div>
                    <button className="border fs-sm border-[#feaa57]">
                      Deposit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="bottom-section">
            <div>
              <label className="flex items-center ">
                <input
                  type="checkbox"
                  className="hidden peer"
                  checked={isChecked}
                  onChange={handleCheckboxChange}
                />
                <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center peer-checked:border-[var(--bg-color-l)] peer-checked:bg-[var(--bg-color-l)]">
                  <svg
                    className={`w-4 h-4 text-black ${isChecked ? "block" : "hidden"
                      }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414L8 11.586l6.793-6.793a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span className="text-gray-500 ms-2 mr-2 fs-sm cursor-pointer">
                  No more reminders today
                </span>
              </label>
            </div>
            <button
              className="activity blue-linear text-white"
              onClick={() => setTopup2(false)}
            >
              Activity
            </button>
          </div>
          <span
            onClick={() => {
              setTopup2(false);
              totalCommissionData?.yesterdayBalance > 0.0 && setShowPopup(true);
            }}
          >
            <RxCrossCircled className="m-auto flex text-center absolute left-0 right-0 justify-center text-2xl mt-4 " />
          </span>
        </div>
      )}
      <Apkdownload />
    </Layout>
  );
};

export default Home;
