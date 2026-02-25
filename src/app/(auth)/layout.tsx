import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image
            src="/FourTen_Logo.png"
            alt="FourTen Markets"
            width={140}
            height={140}
            priority
            className="drop-shadow-xl"
          />
        </div>
        {children}
      </div>
    </div>
  );
}
