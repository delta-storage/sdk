import { Config } from '..'
import { DataResponse, Directory, File } from '../types'
import directoryOperations from './directory'
import fileOperations from './file'

export interface ListenerOperationsInterface {
  connect: () => void
  disconnect: () => void
  onTotalSizeChange: (params: { onChange: (data: any) => void }) => void
  onReadDirectoryEvent: (params: {
    id: string
    onChange: (
      directory: DataResponse & { directories: Directory[]; files: File[] }
    ) => void
  }) => void
  onReadDirectorySegmentChange: (params: {
    segments: string
    onChange: (data: any) => void
  }) => void
}

const ListenerOperations = (config: Config): ListenerOperationsInterface => {
  const dirOps = directoryOperations(config)
  const fileOps = fileOperations(config)
  return {
    connect: () => {
      config.listener.connect()
    },
    disconnect: () => {
      config.listener.disconnect()
    },
    onTotalSizeChange: ({ onChange }) => {
      config.listener.emit('total-size:initialize')
      config.listener.on('total-size:change', async () => {
        const [totalSize] = await fileOps.getTotalSize()
        onChange(totalSize?.totalSize)
      })
    },
    onReadDirectoryEvent: async ({ id, onChange }) => {
      config.listener.emit('directory:initialize')
      config.listener.on('directory:change', async () => {
        const [latestDirectory] = await dirOps.contents({ id })
        if (!latestDirectory) return
        onChange(latestDirectory)
      })
    },
    onReadDirectorySegmentChange: ({ segments, onChange }) => {
      config.listener.on('directory:change', async () => {
        const [res] = await dirOps.getBySegment({ segments })
        onChange(res)
      })
    }
  }
}

export default ListenerOperations
