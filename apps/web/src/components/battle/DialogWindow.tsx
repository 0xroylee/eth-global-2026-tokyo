export function DialogWindow({ title, detail }: { title: string; detail: string }) {
  return (
    <div aria-live="polite" className="h-full bg-[#092B61] p-1 font-pixel shadow-[4px_4px_0_#041833]">
      <div className="flex h-full min-h-[150px] flex-col justify-center border-2 border-white bg-[#FFF9E9] px-5 py-3 text-[#092B61]">
        <p className="break-words text-sm leading-snug sm:text-lg lg:text-[24px]">{title}</p>
        <p className="mt-3 break-words text-xs leading-snug sm:text-sm lg:text-[22px]">{detail}</p>
      </div>
    </div>
  );
}
