import { useSelector } from "react-redux";

const MainLoader = () => {
  const { bannergetData } = useSelector((state) => state.user);

  return (
    <div
      className="fixed z-[99999] w-full md:w-[25rem] top-0 bottom-0 flex flex-col gap-5 items-center justify-center h-screen bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('https://i.ibb.co/NdGFqGsH/img.png')",
      }}
    >
      <div className="absolute bottom-[40px]">
        {/* <h2 className="text-black font-bold arial text-[18px]">
          Withdraw fast, safe and stable
        </h2> */}

        <img
          src={bannergetData?.gameall?.logo1}
          className="w-[200px] h-auto mt-[40px] ml-4"
          alt="logo"
          loading="lazy"
        />
      </div>
    </div>
  );
};

export default MainLoader;
